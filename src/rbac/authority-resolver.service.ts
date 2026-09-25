import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  AuthorizationContextError,
  ServerResolvedAuthority,
} from '../common/context/authorization-context';

export type AuthorityResolutionInput = {
  userId: string;
  tenantId: string;
  tokenVersion: number;
};

type AuthorityCacheEntry = {
  authority: ServerResolvedAuthority;
  expiresAt: number;
};

type AuthorityRow = { tokenVersion: number | string; role: string | null; permission: string | null };

const DEFAULT_TTL_MS = 30_000;

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))].sort();
}

/**
 * Rol/izin çözümleyici + önbellek geçersizleştirme (#339 R4, madde 4).
 *
 * Sunucu-tek-kaynak: efektif izinler veritabanından okunur; önbellek anahtarı
 * `tenantId:userId:tokenVersion` üçlüsüdür. `users.token_version` artırıldığında
 * (yetki iptali/yeniden düzenleme yolu) anahtar değişir, dolayısıyla bayat kayıt
 * ASLA servis edilmez; ek olarak `invalidateUser`/`invalidateTenant` ile açık
 * geçersizleştirme yapılabilir ve TTL (varsayılan 30 sn) sızıntı penceresini
 * sınırlar. `AUTHORITY_CACHE_TTL_MS=0` önbelleği tamamen kapatır.
 */
@Injectable()
export class AuthorityResolverService {
  private readonly logger = new Logger(AuthorityResolverService.name);
  private readonly cache = new Map<string, AuthorityCacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** Önbellek TTL'i (ms). 0 => önbellek kapalı (her istek taze çözümleme). */
  private get ttlMs(): number {
    const raw = process.env.AUTHORITY_CACHE_TTL_MS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_TTL_MS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TTL_MS;
    return Math.floor(parsed);
  }

  private static cacheKey(input: AuthorityResolutionInput): string {
    return `${input.tenantId}:${input.userId}:${input.tokenVersion}`;
  }

  /**
   * Aktörün yetkisini çözer. Tenant kapsamlı sorgu; başka tenant'ın rol/izin
   * satırları asla döndürülmez (JOIN `ur.tenant_id = $2` ile sabitlenir).
   *
   * Fail-closed: kullanıcı pasif/silinmiş ise, token_version uyuşmuyorsa ya da
   * satırlar çözümlenemiyorsa `AuthorizationContextError` fırlatır.
   */
  async resolve(input: AuthorityResolutionInput): Promise<ServerResolvedAuthority> {
    const key = AuthorityResolverService.cacheKey(input);
    const ttl = this.ttlMs;
    if (ttl > 0) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        this.hits += 1;
        return { ...cached.authority, cache: 'hit' };
      }
      if (cached) this.cache.delete(key);
    }

    const authority = await this.loadFromDatabase(input);
    this.misses += 1;
    if (ttl > 0) {
      this.cache.set(key, { authority, expiresAt: Date.now() + ttl });
      this.evictExpired();
    }
    return { ...authority, cache: ttl > 0 ? 'miss' : 'disabled' };
  }


  private async loadFromDatabase(
    input: AuthorityResolutionInput,
  ): Promise<ServerResolvedAuthority> {
    const rows = (await this.dataSource.query(
      `
        SELECT
          u.token_version AS "tokenVersion",
          r.name AS "role",
          p.code AS "permission"
        FROM users u
        JOIN tenant_memberships tm
          ON tm.user_id = u.id
         AND tm.tenant_id = $2::uuid
         AND tm.status = 'active'
         AND tm.deleted_at IS NULL
        LEFT JOIN user_roles ur
          ON ur.user_id = u.id
         AND ur.tenant_id = tm.tenant_id
        LEFT JOIN roles r
          ON r.id = ur.role_id
         AND r.tenant_id = ur.tenant_id
         AND r.deleted_at IS NULL
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE u.id = $1::uuid
          AND u.status = 'active'
          AND u.deleted_at IS NULL
        ORDER BY r.name ASC, p.code ASC
      `,
      [input.userId, input.tenantId],
    )) as AuthorityRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      // Üyelik/kullanıcı yok → bağlam çözülemez (fail-closed).
      throw new AuthorizationContextError('missing_tenant_scope');
    }
    const tokenVersion = Number(rows[0].tokenVersion);
    if (!Number.isInteger(tokenVersion)) {
      throw new AuthorizationContextError('unresolved_authority');
    }
    if (tokenVersion !== Number(input.tokenVersion)) {
      // Token'daki sürüm bayat: yetki çözümü reddedilir, önbellek temizlenir.
      this.invalidateUser(input.userId, input.tenantId);
      throw new AuthorizationContextError('stale_authorization_version');
    }

    const roles = uniqueSorted(rows.map((row) => row.role));
    const permissions = uniqueSorted(rows.map((row) => row.permission));
    if (roles.length === 0) {
      // Rolü olmayan üyelik: izin kümesi boş kalır (fail-closed deny).
      this.logger.warn(
        JSON.stringify({
          event: 'authority.roles.empty',
          tenantId: input.tenantId,
          actorId: input.userId,
        }),
      );
    }
    return {
      roles,
      permissions,
      tokenVersion,
      resolvedAt: new Date().toISOString(),
      cache: 'miss',
    };
  }

  /** Belirli bir kullanıcının (veya tüm tenant'ın) önbelleğini temizler. */
  invalidateUser(userId: string, tenantId?: string): number {
    let removed = 0;
    for (const key of [...this.cache.keys()]) {
      const [keyTenant, keyUser] = key.split(':');
      if (keyUser !== userId) continue;
      if (tenantId && keyTenant !== tenantId) continue;
      this.cache.delete(key);
      removed += 1;
    }
    return removed;
  }

  /** Tenant genelindeki tüm yetki kayıtlarını temizler (rol/izin mutasyonu). */
  invalidateTenant(tenantId: string): number {
    let removed = 0;
    for (const key of [...this.cache.keys()]) {
      if (!key.startsWith(`${tenantId}:`)) continue;
      this.cache.delete(key);
      removed += 1;
    }
    return removed;
  }

  invalidateAll(): number {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }

  stats(): { size: number; hits: number; misses: number; ttlMs: number } {
    return { size: this.cache.size, hits: this.hits, misses: this.misses, ttlMs: this.ttlMs };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of [...this.cache.entries()]) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }
}
