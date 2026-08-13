export class TenantScopeRequiredError extends Error {
  readonly code = 'tenant_scope_required';
  readonly httpStatus = 500;

  constructor(resourceName: string) {
    super(`Tenant scope is required for ${resourceName}`);
    this.name = 'TenantScopeRequiredError';
  }
}

/**
 * Raised when a request attempts to act on data that belongs to a tenant
 * different from the authenticated request tenant. This is the primary
 * defence against cross-tenant data access and maps to HTTP 403 so it does
 * not leak whether the resource exists in another tenant.
 */
export class CrossTenantAccessError extends Error {
  readonly code = 'cross_tenant_access';
  readonly httpStatus = 403;

  constructor(details?: { resourceName?: string; expectedTenantId?: string }) {
    const safe = details?.expectedTenantId
      ? ` (expected tenant ${details.expectedTenantId})`
      : '';
    super(
      `Cross-tenant access denied${details?.resourceName ? ` on ${details.resourceName}` : ''}${safe}`,
    );
    this.name = 'CrossTenantAccessError';
  }
}

/**
 * Raised when the tenant cannot be resolved/validated for a request
 * (missing tenant, malformed tenant identifier, or unverifiable tenant).
 * Maps to HTTP 401 because the request is not attributable to a trusted tenant.
 */
export class TenantResolutionError extends Error {
  readonly code = 'tenant_resolution';
  readonly httpStatus = 401;
  /** When the failure is a header/token mismatch we want a 403, not a 401. */
  readonly mismatch: boolean;

  constructor(reason: string, mismatch = false) {
    super(`Tenant resolution failed: ${reason}`);
    this.name = 'TenantResolutionError';
    this.mismatch = mismatch;
  }
}
