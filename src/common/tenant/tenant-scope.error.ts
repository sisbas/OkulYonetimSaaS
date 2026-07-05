export class TenantScopeRequiredError extends Error {
  readonly code = 'tenant_scope_required';
  readonly httpStatus = 500;

  constructor(resourceName: string) {
    super(`Tenant scope is required for ${resourceName}`);
    this.name = 'TenantScopeRequiredError';
  }
}
