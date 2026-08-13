import { RequestContext } from '../context/request-context';
import { CrossTenantAccessError } from './tenant-scope.error';
import { collectTenantKeyValues, hasTenantKeyConflict } from './tenant-query.helper';

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
 * Scan an arbitrary entity-like object for ALL tenant identifier keys
 * (tenantId, tenant_id, ...) and assert every one of them equals the request
 * tenant. This is defence-in-depth for generic row processors where the exact
 * tenant column name is unknown at compile time.
 *
 * ÖNEMLİ: Yalnızca ilk tanımlı alias'ı kontrol etmek YETERSİZ. Örnek:
 *   { tenantId: ctx.tenantId, tenant_id: foreignTenant }
 * Burada `tenantId` eşleşir ama `tenant_id` yabancı kiracıya işaret eder.
 * Tüm alias'lar toplanır; aralarında çakışma (farklı değer) varsa VEYA
 * herhangi biri istek kiracısından farklıysa 403 (CrossTenantAccessError)
 * fırlatılır.
 */
export function assertNoForeignTenantInRecord(
  ctx: RequestContext,
  record: Record<string, unknown> | null | undefined,
  resourceName = 'tenant-scoped-resource',
): void {
  if (!record) return;

  // Tüm tanımlı kiracı alias değerlerini topla (tenantId, tenant_id, ...).
  const values = collectTenantKeyValues({ body: record });

  // Çift alias çakışması: {tenantId: A, tenant_id: B} → reddet.
  if (hasTenantKeyConflict(values)) {
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }

  if (values.length === 0) return;

  // Tek değer varsa (ya da hepsi aynıysa) istek kiracısıyla eşit mi kontrol et.
  assertSameTenant(ctx, values[0], resourceName);
}

