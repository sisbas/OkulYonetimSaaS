import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';

import {
  AUTH_ACCESS_TOKEN_AUDIENCE,
  AUTH_REFRESH_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  AuthService,
} from './auth.service';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const TENANT_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '20000000-0000-4000-8000-000000000002';
const SESSION_ID = '30000000-0000-4000-8000-000000000001';

function authService(query: jest.Mock) {
  const manager = { query } as unknown as EntityManager;
  const dataSource = {
    manager,
    query,
    transaction: jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) => callback(manager)),
  } as unknown as DataSource;
  const jwt = { signAsync: jest.fn(async (payload: unknown) => `signed:${JSON.stringify(payload)}`), verifyAsync: jest.fn() } as unknown as JwtService;
  return { service: new AuthService(jwt, dataSource), jwt: jwt as jest.Mocked<JwtService>, dataSource };
}

describe('AuthService login', () => {
  it('resolves tenant, roles and permissions from the database instead of login body claims', async () => {
    const credentialHash = await bcrypt.hash('secret', 4);
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ userId: USER_ID, credentialHash, authorizationVersion: 7 }])
      .mockResolvedValueOnce([{ tenantId: TENANT_ID }])
      .mockResolvedValueOnce([
        { roleId: 'teacher', permission: 'leave:create' },
        { roleId: 'teacher', permission: 'leave:own:read' },
      ])
      .mockResolvedValueOnce([]);
    const { service, jwt } = authService(query);

    const result = await service.login({
      email: ' Teacher@Example.Test ',
      password: 'secret',
      tenantId: TENANT_ID,
      requestId: 'req-login-1',
    });

    expect(result.refreshTokenId).toMatch(/[0-9a-f-]{36}/);
    expect(result).not.toHaveProperty('refreshTokenHash');
    expect(jwt.signAsync).toHaveBeenNthCalledWith(1, {
      sub: USER_ID,
      tenant_id: TENANT_ID,
      session_id: result.refreshTokenId,
      jti: result.refreshTokenId,
      authorization_version: 7,
    }, expect.objectContaining({
      issuer: AUTH_TOKEN_ISSUER,
      audience: AUTH_ACCESS_TOKEN_AUDIENCE,
      expiresIn: '15m',
    }));
    expect(jwt.signAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      session_id: result.refreshTokenId,
      jti: result.refreshTokenId,
    }), expect.objectContaining({
      issuer: AUTH_TOKEN_ISSUER,
      audience: AUTH_REFRESH_TOKEN_AUDIENCE,
      expiresIn: '30d',
    }));
    expect(JSON.parse(result.accessToken.replace('signed:', ''))).not.toHaveProperty('permissions');
    expect(JSON.parse(result.accessToken.replace('signed:', ''))).not.toHaveProperty('roles');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO user_sessions'), expect.arrayContaining([
      result.refreshTokenId,
      TENANT_ID,
      USER_ID,
      expect.any(String),
      expect.any(Date),
    ]));
  });

  it('rejects a tenant selector without active membership', async () => {
    const credentialHash = await bcrypt.hash('secret', 4);
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ userId: USER_ID, credentialHash, authorizationVersion: 1 }])
      .mockResolvedValueOnce([]);
    const { service } = authService(query);

    await expect(service.login({
      email: 'teacher@example.test',
      password: 'secret',
      tenantId: OTHER_TENANT_ID,
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires explicit tenant selection when more than one active membership exists', async () => {
    const credentialHash = await bcrypt.hash('secret', 4);
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ userId: USER_ID, credentialHash, authorizationVersion: 1 }])
      .mockResolvedValueOnce([{ tenantId: TENANT_ID }, { tenantId: OTHER_TENANT_ID }]);
    const { service } = authService(query);

    await expect(service.login({
      email: 'teacher@example.test',
      password: 'secret',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not create a session when the password is invalid', async () => {
    const credentialHash = await bcrypt.hash('secret', 4);
    const query = jest.fn().mockResolvedValueOnce([{ userId: USER_ID, credentialHash, authorizationVersion: 1 }]);
    const { service } = authService(query);

    await expect(service.login({
      email: 'teacher@example.test',
      password: 'wrong',
      tenantId: TENANT_ID,
    })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService access-token validation', () => {
  it('returns current database roles and permissions for an active session', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ userId: USER_ID, authorizationVersion: 3 }])
      .mockResolvedValueOnce([
        { roleId: 'operations_manager', permission: 'leave:approve' },
        { roleId: 'operations_manager', permission: 'leave:reject' },
      ]);
    const { service } = authService(query);

    await expect(service.validateAccessTokenSession({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      session_id: SESSION_ID,
      jti: SESSION_ID,
      authorization_version: 3,
    })).resolves.toEqual({
      userId: USER_ID,
      tenantId: TENANT_ID,
      sessionId: SESSION_ID,
      authorizationVersion: 3,
      roleIds: ['operations_manager'],
      permissions: ['leave:approve', 'leave:reject'],
    });
  });

  it('rejects stale authorization versions', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ userId: USER_ID, authorizationVersion: 4 }]);
    const { service } = authService(query);

    await expect(service.validateAccessTokenSession({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      session_id: SESSION_ID,
      jti: SESSION_ID,
      authorization_version: 3,
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects inactive or missing sessions before resolving permissions', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = authService(query);

    await expect(service.validateAccessTokenSession({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      session_id: SESSION_ID,
      jti: SESSION_ID,
      authorization_version: 1,
    })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(query).toHaveBeenCalledTimes(1);
  });
});
