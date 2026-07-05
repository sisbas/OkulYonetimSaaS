import { RequestContext } from '../context/request-context';
import { TenantScopeRequiredError } from './tenant-scope.error';

export type TenantScopedRequestContext = RequestContext & { tenantId: string };

export type TenantScopedQueryInput = {
  ctx: RequestContext;
};

export function assertTenantScope(
  ctx: RequestContext | undefined,
  resourceName: string,
): asserts ctx is TenantScopedRequestContext {
  if (!ctx?.tenantId) {
    throw new TenantScopeRequiredError(resourceName);
  }
}
