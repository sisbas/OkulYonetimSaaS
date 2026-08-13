import { RequestContext } from '../context/request-context';
import { assertTenantScope } from './assert-tenant-scope';
import { CrossTenantAccessError } from './tenant-scope.error';

export type TenantColumnName = 'tenantId' | 'tenant_id';

export const TENANT_KEYS: ReadonlyArray<string> = ['tenantId', 'tenant_id'];

export function isTenantKey(key: string): boolean {
  return TENANT_KEYS.includes(key);
}

/** Normalize a tenant column name (tenantId, tenant_id, etc.) to the requested column name. */
export function normalizeTenantKey(key: string, target: TenantColumnName): TenantColumnName {
  if (key !== 'tenantId' && key !== 'tenant_id') {
    throw new Error(`Not a tenant key: ${key}`);
  }
  return target;
}

type AnyRecord = Record<string, unknown>;

export function omitTenantKeys<T extends AnyRecord>(input?: T): Omit<T, 'tenantId' | 'tenant_id'> {
  if (!input) return {} as Omit<T, 'tenantId' | 'tenant_id'>;
  const { tenantId: _tenantId, tenant_id: _tenant_id, ...safeInput } = input;
  return safeInput;
}

/**
 * Inspect a caller-supplied object for any tenant identifier key. Returns the
 * supplied value (so callers can decide whether to strip it) WITHOUT throwing.
 *
 * NOTE: For fail-safe writer isolation the helpers `tenantWhere`/`tenantData`
 * deliberately *ignore* any foreign tenant value and always re-stamp the
 * request tenant (see `omitTenantKeys`). The strict, throwing variant lives in
 * `assertNoCrossTenantTenantKey` and in the repository layer, so a hostile
 * payload can never route writes/reads to a foreign tenant while the broad
 * helper surface stays backwards compatible with existing silent-override
 * callers.
 */
export function detectConflictingTenantKeys(
  ctx: RequestContext,
  input: AnyRecord | undefined,
  _resourceName = 'tenant-scoped-resource',
): string | undefined {
  if (!input) return undefined;
  const supplied = TENANT_KEYS.map((key) => input[key]).find((value) => value !== undefined);
  if (supplied === undefined) return undefined;
  return supplied as string;
}

/** Convenience assertion used by repositories/guards before applying caller input. */
export function assertNoCrossTenantTenantKey(
  ctx: RequestContext,
  input: AnyRecord | undefined,
  resourceName = 'tenant-scoped-resource',
): void {
  if (!input) return;
  const supplied = TENANT_KEYS.map((key) => input[key]).find((value) => value !== undefined);
  if (supplied === undefined) return;
  if (ctx.tenantId && supplied !== ctx.tenantId) {
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }
}

export function tenantWhere<T extends AnyRecord>(
  ctx: RequestContext,
  where?: T,
  resourceName = 'tenant-scoped-resource',
  tenantColumn: TenantColumnName = 'tenant_id',
): Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string> {
  assertTenantScope(ctx, resourceName);
  // Fail-safe: any caller-supplied tenant key is stripped and the request
  // tenant is authoritative — a forged tenant can never leak into the query.
  return {
    ...omitTenantKeys(where),
    [tenantColumn]: ctx.tenantId,
  } as Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string>;
}

export function tenantData<T extends AnyRecord>(
  ctx: RequestContext,
  data: T,
  resourceName = 'tenant-scoped-resource',
  tenantColumn: TenantColumnName = 'tenant_id',
): Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string> {
  assertTenantScope(ctx, resourceName);
  return {
    ...omitTenantKeys(data),
    [tenantColumn]: ctx.tenantId,
  } as Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string>;
}
