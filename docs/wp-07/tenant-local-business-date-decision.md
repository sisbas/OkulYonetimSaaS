# WP-07 Teacher identity business-date decision

## Decision

Teacher identity and TeacherBranch effective-period validation use a verified tenant-local business date carried in `RequestContext.businessDate`.

```text
PRODUCTION DECISION: REQUEST_CONTEXT_TENANT_LOCAL_BUSINESS_DATE
GLOBAL_UTC_FALLBACK: REJECTED
```

The resolver fails closed when `businessDate` is missing, malformed, not marked `tenant_local`, or scoped to a different tenant.

## Options compared

| Option | Description | Strengths | Weaknesses | Production decision |
|---|---|---|---|---|
| Tenant settings IANA timezone -> server-side date | Resolve tenant timezone from settings and compute local date in the service or middleware. | Central source of truth; supports multi-timezone tenants. | Requires tenant settings schema/read path to be available in every auth-sensitive path; introduces DB/config coupling inside identity resolution. | Good source for producing the business date, but not the direct service dependency in this PR. |
| Verified tenant-local business date in request context | Upstream trusted tenant context resolves the tenant business date and passes `{ tenantId, date, source: 'tenant_local' }` to domain services. | Keeps domain services deterministic; prevents client/JWT date authority; allows exact tests; fails closed when date is missing. | Requires upstream middleware/interceptor contract before runtime endpoints use the resolver. | Selected. |
| Global UTC date | Use `new Date().toISOString().slice(0, 10)` in the resolver. | Simple and dependency-free. | Incorrect around local midnight; silently changes teacher membership eligibility; unsafe for Türkiye and future multi-timezone tenants. | Rejected. No silent fallback. |

## Guardrails

- Client body/query/JWT values are not accepted as Teacher identity or business-date authority.
- `RequestContext.businessDate.tenantId` must match the active tenant.
- `RequestContext.businessDate.source` must be `tenant_local`.
- Date format must be `YYYY-MM-DD`.
- Missing or invalid business date returns the same non-enumerating denial path as inactive/cross-tenant teacher identity.
- Audit emits only the exact allowlist reason code and does not log PII.

## Follow-up boundary

This PR defines the consumer-side contract and fail-closed behavior. The upstream tenant-context producer should derive the business date from verified tenant settings, preferably an IANA timezone, in a separate bounded PR if that producer is not already present.
