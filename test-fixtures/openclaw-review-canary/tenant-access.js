/**
 * Disposable Issue #205 review-thread lifecycle canary.
 * This fixture is intentionally disconnected from production code.
 */
export function canAccessTenantResource(requestTenantId, resourceTenantId) {
  return requestTenantId === resourceTenantId;
}
