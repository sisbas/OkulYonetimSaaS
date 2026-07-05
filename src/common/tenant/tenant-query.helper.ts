import { RequestContext } from '../context/request-context';
import { assertTenantScope } from './assert-tenant-scope';

export type TenantColumnName = 'tenantId' | 'tenant_id';

type AnyRecord = Record<string, unknown>;

export function omitTenantKeys<T extends AnyRecord>(input?: T): Omit<T, 'tenantId' | 'tenant_id'> {
  if (!input) return {} as Omit<T, 'tenantId' | 'tenant_id'>;
  const { tenantId: _tenantId, tenant_id: _tenant_id, ...safeInput } = input;
  return safeInput;
}

export function tenantWhere<T extends AnyRecord>(
  ctx: RequestContext,
  where?: T,
  resourceName = 'tenant-scoped-resource',
  tenantColumn: TenantColumnName = 'tenant_id',
): Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string> {
  assertTenantScope(ctx, resourceName);

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
