import { randomUUID } from 'crypto';
import { NextFunction, Response } from 'express';
import { RequestWithContext } from '../context/request-context';
import { TenantResolutionError } from './tenant-scope.error';
import { collectTenantKeyValues, hasTenantKeyConflict } from './tenant-query.helper';

/**
 * Tenant identifier shape. Rejects obviously-malformed ids so a malformed or
 * forgeable tenant value can never be trusted as a scope root. UUIDs are
 * required for tenant ids in this system.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidTenantId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * A fully-resolved tenant context. `tenantId` is guaranteed non-empty and
 * format-valid. `source` records where the resolved tenant came from so audit
 * trails can show whether it was derived from a token (trusted) or a header
 * (untrusted / bootstrapping).
 */
export type ResolvedTenantContext = {
  requestId: string;
  tenantId: string;
  source: 'jwt' | 'header' | 'bootstrap';
  user?: RequestWithContext['user'];
};

/**
 * Minimal request shape needed to resolve a tenant. Kept loose on purpose so
 * it can be fed by Express `Request` objects (whose `header()` may return
 * `string | string[]`) and by plain test fakes.
 */
export type TenantResolutionRequest = {
  header?: (name: string) => string | string[] | undefined;
  user?: RequestWithContext['user'];
};

function asStringHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Resolve the effective tenant id for a request. This is the single, strict
 * entry point used by the middleware and can be reused by tests and other
 * resolvers.
 *
 * Rules:
 *  - Both JWT (`req.user.tenantId`) and `x-tenant-id` header may be present.
 *  - A header value that conflicts with the token tenant is rejected (403).
 *  - A token tenant always wins (trusted source).
 *  - If only a header is present it is used but marked `header` (untrusted)
 *    so downstream bootstrapping can decide whether to allow it.
 *  - A tenant id must be a valid UUID; malformed values are rejected (401).
 *  - When neither is present, resolution fails (401) — no implicit/empty scope.
 */
export function resolveTenantContext(
  req: TenantResolutionRequest,
  options: { requestId?: string; requireTenant?: boolean; validateFormat?: boolean } = {},
): ResolvedTenantContext {
  const requireTenant = options.requireTenant ?? true;
  const validateFormat = options.validateFormat ?? true;

  // Tüm kiracı alias'larını topla: 'x-tenant-id', 'tenant-id', 'tenantId'
  // başlıkları (herhangi biri gönderilmiş olabilir) + JWT içindeki tenant.
  // Sadece ilk değeri kontrol etmek yetersiz; çift alias
  // ({tenantId: A, tenant_id: B}) sahtekarlığına karşı HEPSİ tek tek incelenir.
  const headerCandidates: string[] = ['x-tenant-id', 'tenant-id', 'tenantId']
    .map((name) => asStringHeader(req.header?.(name)) ?? undefined)
    .filter((v): v is string => typeof v === 'string');
  const jwtTenantId = req.user?.tenantId;

  // Format doğrulaması: tanımlı olan her alias geçerli bir UUID olmalı.
  if (validateFormat) {
    for (const v of headerCandidates) {
      if (!isValidTenantId(v)) {
        throw new TenantResolutionError(`malformed tenant id in request header`);
      }
    }
    if (jwtTenantId && !isValidTenantId(jwtTenantId)) {
      throw new TenantResolutionError(`malformed token tenant_id`);
    }
  }

  // Çakışma tespiti: tanımlı tüm alias değerleri birbiriyle AYNI olmalı.
  // Farklı değerler varsa (ör. başlık JWT ile çakışıyor) → 403 (mismatch).
  const allValues = [...headerCandidates];
  if (jwtTenantId) allValues.push(jwtTenantId);
  if (hasTenantKeyConflict(allValues)) {
    throw new TenantResolutionError(`conflicting tenant identifiers in request`, true);
  }

  const headerTenantId = headerCandidates[0];
  const tenantId = jwtTenantId ?? headerTenantId;
  const source: ResolvedTenantContext['source'] = jwtTenantId ? 'jwt' : headerTenantId ? 'header' : 'bootstrap';

  if (!tenantId) {
    if (requireTenant) {
      throw new TenantResolutionError('no tenant resolvable from token or x-tenant-id header');
    }
    return {
      requestId: options.requestId ?? randomUUID(),
      tenantId: '',
      source: 'bootstrap',
      user: req.user,
    };
  }

  if (validateFormat && !isValidTenantId(tenantId)) {
    throw new TenantResolutionError(`invalid tenant identifier: ${String(tenantId)}`);
  }

  return {
    requestId: options.requestId ?? randomUUID(),
    tenantId,
    source,
    user: req.user,
  };
}

/**
 * Build an Express-style request context object from a resolved tenant. This is
 * used by the middleware so the runtime behaviour is identical to before but
 * now goes through the strict resolver.
 */
export function buildRequestContextFromResolution(resolved: ResolvedTenantContext) {
  return {
    requestId: resolved.requestId,
    tenantId: resolved.tenantId || undefined,
    user: resolved.user,
  };
}

/**
 * Apply a resolved tenant context onto an Express request and continue. Kept as
 * a standalone helper so it can be unit tested without booting Nest.
 */
export function applyTenantContext(req: RequestWithContext, _res: Response, next: NextFunction): void {
  const resolved = resolveTenantContext(req);
  req.context = buildRequestContextFromResolution(resolved);
  next();
}

/**
 * Resolve tenant context purely from a request (no Express plumbing). Used by
 * the middleware and reusable by other resolvers/tests.
 */
export function resolveTenantContextFromRequest(
  req: Pick<RequestWithContext, 'header' | 'user'>,
  options: { requestId?: string; requireTenant?: boolean } = {},
): ResolvedTenantContext {
  return resolveTenantContext(req, options);
}

/**
 * Bootstrapping verification. Confirms that a resolved tenant context is
 * internally consistent: format-valid, non-empty (unless explicitly allowed),
 * and — when a token is present — matches the token's tenant. Returns true on
 * success. This is the gate that prevents a request from proceeding under an
 * unverified or forged tenant scope.
 */
export function verifyTenantBootstrap(resolved: ResolvedTenantContext): boolean {
  if (!resolved.tenantId) {
    return false;
  }
  if (!isValidTenantId(resolved.tenantId)) {
    return false;
  }
  if (resolved.user?.tenantId && resolved.user.tenantId !== resolved.tenantId) {
    return false;
  }
  return true;
}
