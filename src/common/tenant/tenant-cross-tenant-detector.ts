import { RequestContext } from '../context/request-context';
import { CrossTenantAccessError } from './tenant-scope.error';
import { TENANT_KEYS } from './tenant-query.helper';

/**
 * Centralized cross-tenant access detection. Any code path that reads or writes
 * a tenant-scoped record should pass the record's tenant identifier through
 * `assertSameTenant` before returning it to the caller. This guarantees that a
 * record belonging to tenant B can never be surfaced to a request operating as
 * tenant A — closing the classic "IDOR" / broken-object-level-authorization
 * class of vulnerabilities.
 */
export function assertSameTenant(
  ctx: RequestContext,
  recordTenantId: string | undefined,
  resourceName = 'tenant-scoped-resource',
): void {
  if (!ctx.tenantId) {
    // No scope: caller should have failed earlier at assertTenantScope. Treat as
    // a cross-tenant denial because we cannot prove the record belongs to them.
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }
  if (recordTenantId === undefined || recordTenantId === null) {
    // A record with no tenant stamp cannot be proven safe in a multi-tenant store.
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }
  if (recordTenantId !== ctx.tenantId) {
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }
}

/**
 * Returns true when a record's tenant identifier matches the request tenant.
 * Non-throwing variant for filtering/list operations.
 */
export function isSameTenant(ctx: RequestContext, recordTenantId: string | undefined): boolean {
  return Boolean(ctx.tenantId) && recordTenantId !== undefined && recordTenantId === ctx.tenantId;
}

/**
 * Scan an arbitrary entity-like object for any tenant identifier key and assert
 * it equals the request tenant. Useful for defence-in-depth where the exact
 * tenant column name is unknown at compile time (e.g. generic row processors).
 */
export function assertNoForeignTenantInRecord(
  ctx: RequestContext,
  record: Record<string, unknown> | null | undefined,
  resourceName = 'tenant-scoped-resource',
): void {
  if (!record) return;
  const found = TENANT_KEYS.map((key) => record[key]).find((value) => value !== undefined);
  if (found === undefined) return;
  assertSameTenant(ctx, String(found), resourceName);
}
