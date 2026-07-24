import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const AUTH_TOKEN_ISSUER = process.env.JWT_ISSUER ?? 'okul-yonetim-saas';
export const AUTH_ACCESS_TOKEN_AUDIENCE = process.env.JWT_ACCESS_AUDIENCE ?? 'okul-yonetim-saas-api';
export const AUTH_REFRESH_TOKEN_AUDIENCE = process.env.JWT_REFRESH_AUDIENCE ?? 'okul-yonetim-saas-refresh';

export type LoginCommand = Readonly<{
  email: string;
  password: string;
  tenantId?: string;
  requestId?: string;
}>;

export type AuthenticatedRequestUser = Readonly<{
  userId: string;
  tenantId: string;
  sessionId: string;
  authorizationVersion: number;
  roleIds: string[];
  permissions: string[];
}>;

export type AccessTokenPayload = Readonly<{
  sub: string;
  tenant_id: string;
  session_id: string;
  jti: string;
  authorization_version: number;
}>;

type UserCredentialRow = Readonly<{
  userId: string;
  credentialHash: string;
  authorizationVersion: number;
}>;

type MembershipRow = Readonly<{ tenantId: string }>;
type AuthorityRow = Readonly<{ roleId: string; permission: string | null }>;

type AuthenticationDeniedReasonCode =
  | 'invalid_credentials'
  | 'invalid_tenant_selection'
  | 'tenant_selection_required'
  | 'inactive_membership'
  | 'invalid_session'
  | 'stale_authorization_version';

function isUuid(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async login(command: LoginCommand) {
    const email = command.email?.trim().toLowerCase();
    if (!email || !command.password) {
      this.emitAuthenticationDenied('invalid_credentials', { requestId: command.requestId });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (command.tenantId !== undefined && !isUuid(command.tenantId)) {
      this.emitAuthenticationDenied('invalid_tenant_selection', { requestId: command.requestId });
      throw new BadRequestException('Invalid tenant selection');
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await this.findActiveUserByEmail(manager, email);
      if (!user || !(await bcrypt.compare(command.password, user.credentialHash))) {
        this.emitAuthenticationDenied('invalid_credentials', { requestId: command.requestId });
        throw new UnauthorizedException('Invalid credentials');
      }

      const tenantId = await this.resolveTenantMembership(manager, user.userId, command.tenantId, command.requestId);
      const authority = await this.resolveAuthority(manager, user.userId, tenantId);
      return this.issueTokenPair(manager, {
        userId: user.userId,
        tenantId,
        authorizationVersion: Number(user.authorizationVersion),
        roleIds: authority.roleIds,
        permissions: authority.permissions,
      });
    });
  }

  private async issueTokenPair(
    manager: EntityManager,
    subject: Omit<AuthenticatedRequestUser, 'sessionId'>,
  ) {
    const sessionId = randomUUID();
    const accessToken = await this.jwt.signAsync(
      {
        sub: subject.userId,
        tenant_id: subject.tenantId,
        session_id: sessionId,
        jti: sessionId,
        authorization_version: subject.authorizationVersion,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_ACCESS_TOKEN_AUDIENCE,
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      {
        sub: subject.userId,
        tenant_id: subject.tenantId,
        session_id: sessionId,
        jti: sessionId,
      },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_REFRESH_TOKEN_AUDIENCE,
        expiresIn: REFRESH_TOKEN_TTL,
      },
    );
    await manager.query(
      `
        INSERT INTO user_sessions (
          id,
          tenant_id,
          user_id,
          refresh_secret_hash,
          status,
          expires_at
        )
        VALUES ($1, $2, $3, $4, 'active', $5)
      `,
      [
        sessionId,
        subject.tenantId,
        subject.userId,
        await bcrypt.hash(refreshToken, 12),
        new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      ],
    );
    return { accessToken, refreshToken, refreshTokenId: sessionId };
  }

  async validateAccessTokenSession(payload: AccessTokenPayload): Promise<AuthenticatedRequestUser> {
    if (!isUuid(payload.sub) || !isUuid(payload.tenant_id) || !isUuid(payload.session_id)) {
      this.emitAuthenticationDenied('invalid_session', {});
      throw new UnauthorizedException('Invalid session');
    }

    const rows = await this.dataSource.query(
      `
        SELECT u.id::text AS "userId", u.token_version AS "authorizationVersion"
        FROM users u
        JOIN tenant_memberships tm
          ON tm.user_id = u.id
         AND tm.tenant_id = $2::uuid
         AND tm.status = 'active'
         AND tm.deleted_at IS NULL
        JOIN tenants t
          ON t.id = tm.tenant_id
         AND t.status = 'active'
         AND t.deleted_at IS NULL
        JOIN user_sessions s
          ON s.id = $3::uuid
         AND s.user_id = u.id
         AND s.tenant_id = tm.tenant_id
         AND s.status = 'active'
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
        WHERE u.id = $1::uuid
          AND u.status = 'active'
          AND u.deleted_at IS NULL
        LIMIT 1
      `,
      [payload.sub, payload.tenant_id, payload.session_id],
    );
    const row = rows[0] as { userId: string; authorizationVersion: number } | undefined;
    if (!row) {
      this.emitAuthenticationDenied('invalid_session', { tenantId: payload.tenant_id, userId: payload.sub });
      throw new UnauthorizedException('Invalid session');
    }
    const authorizationVersion = Number(row.authorizationVersion);
    if (authorizationVersion !== Number(payload.authorization_version)) {
      this.emitAuthenticationDenied('stale_authorization_version', { tenantId: payload.tenant_id, userId: payload.sub });
      throw new UnauthorizedException('Invalid session');
    }
    const authority = await this.resolveAuthority(this.dataSource.manager, payload.sub, payload.tenant_id);
    return {
      userId: row.userId,
      tenantId: payload.tenant_id,
      sessionId: payload.session_id,
      authorizationVersion,
      roleIds: authority.roleIds,
      permissions: authority.permissions,
    };
  }

  async assertRefreshToken(refreshToken: string, storedHash: string) {
    const ok = await bcrypt.compare(refreshToken, storedHash);
    if (!ok) throw new UnauthorizedException('Invalid refresh token');
    return this.jwt.verifyAsync(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      issuer: AUTH_TOKEN_ISSUER,
      audience: AUTH_REFRESH_TOKEN_AUDIENCE,
    });
  }

  private async findActiveUserByEmail(manager: EntityManager, email: string): Promise<UserCredentialRow | null> {
    const rows = await manager.query(
      `
        SELECT id::text AS "userId", credential_hash AS "credentialHash", token_version AS "authorizationVersion"
        FROM users
        WHERE lower(email) = lower($1)
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [email],
    );
    return (rows[0] as UserCredentialRow | undefined) ?? null;
  }

  private async resolveTenantMembership(
    manager: EntityManager,
    userId: string,
    requestedTenantId: string | undefined,
    requestId: string | undefined,
  ): Promise<string> {
    const rows = await manager.query(
      `
        SELECT tm.tenant_id::text AS "tenantId"
        FROM tenant_memberships tm
        JOIN tenants t
          ON t.id = tm.tenant_id
         AND t.status = 'active'
         AND t.deleted_at IS NULL
        WHERE tm.user_id = $1::uuid
          AND tm.status = 'active'
          AND tm.deleted_at IS NULL
          AND ($2::uuid IS NULL OR tm.tenant_id = $2::uuid)
        ORDER BY tm.created_at ASC, tm.tenant_id ASC
      `,
      [userId, requestedTenantId ?? null],
    );
    const memberships = rows as MembershipRow[];
    if (requestedTenantId && memberships.length === 0) {
      this.emitAuthenticationDenied('inactive_membership', { requestId, tenantId: requestedTenantId, userId });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!requestedTenantId && memberships.length > 1) {
      this.emitAuthenticationDenied('tenant_selection_required', { requestId, userId });
      throw new BadRequestException('Tenant selection required');
    }
    const tenantId = memberships[0]?.tenantId;
    if (!tenantId) {
      this.emitAuthenticationDenied('inactive_membership', { requestId, userId });
      throw new UnauthorizedException('Invalid credentials');
    }
    return tenantId;
  }

  private async resolveAuthority(
    manager: Pick<EntityManager, 'query'>,
    userId: string,
    tenantId: string,
  ): Promise<Pick<AuthenticatedRequestUser, 'roleIds' | 'permissions'>> {
    const rows = await manager.query(
      `
        SELECT DISTINCT r.name AS "roleId", p.code AS "permission"
        FROM user_roles ur
        JOIN roles r
          ON r.id = ur.role_id
         AND r.tenant_id = ur.tenant_id
         AND r.deleted_at IS NULL
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1::uuid
          AND ur.tenant_id = $2::uuid
        ORDER BY r.name ASC, p.code ASC
      `,
      [userId, tenantId],
    );
    const authorityRows = rows as AuthorityRow[];
    return {
      roleIds: uniqueSorted(authorityRows.map((row) => row.roleId)),
      permissions: uniqueSorted(authorityRows.map((row) => row.permission).filter((permission): permission is string => Boolean(permission))),
    };
  }

  private emitAuthenticationDenied(
    reasonCode: AuthenticationDeniedReasonCode,
    input: { requestId?: string; tenantId?: string; userId?: string },
  ): void {
    this.logger.warn(JSON.stringify({
      eventName: 'auth.login.denied',
      requestId: input.requestId ?? 'unknown',
      tenantId: input.tenantId,
      actorId: input.userId,
      outcome: 'denied',
      reasonCode,
    }));
  }
}
