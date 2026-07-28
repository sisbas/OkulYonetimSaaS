# Issue #179 Implementation Note

## Decision

Daily Operations queue/today read API and mutation version retrieval are backend-owned.

## Implemented surfaces

- `GET /api/v1/daily-operations/today?branchId=<uuid>&date=YYYY-MM-DD`
- `leaveVersion` and `leaveEtag` on leave impact mutation responses
- PII-free queue response allowlist
- Non-enumerating branch visibility failure code: `BRANCH_NOT_VISIBLE`
- Contract test coverage for route, permission, ETag and DTO fields

## Authority rule

Tenant comes from `RequestContext.tenantId`. Branch is only a filter and must be validated server-side. Browser-supplied versions are never authoritative; `If-Match` must be copied from current server response.
