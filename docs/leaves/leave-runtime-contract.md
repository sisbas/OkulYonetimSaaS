# Leave Management Runtime Contract

Refs #143. Ready/merge depends on #140, #141, #160 and #162 PASS.

## Domain states

- Duration: `hourly`, `full_day`, `multi_day`
- Reason: `annual_leave`, `administrative`, `health`, `other`
- Decision: `pending`, `approved`, `rejected`
- Coverage: `not_required`, `unresolved`, `partially_covered`, `covered`

Decision and coverage are separate state machines. Coverage does not silently imply
approval. Until Schedule impact analysis and Daily Operations work are persisted in
the same transaction, approval fails closed with `IMPACT_ANALYSIS_NOT_READY`.

## API surface

| Method | Path | Permission | Scope |
|---|---|---|---|
| POST | `/api/v1/leaves/me` | `leave:create` | teacher own; branch must belong to active tenant |
| GET | `/api/v1/leaves/me` | `leave:own:read` | teacher own history (filter: `branchId`, `decisionStatus`, `from`, `to`) |
| GET | `/api/v1/leaves/me/:id` | `leave:own:read` | teacher own |
| GET | `/api/v1/leaves` | `leave:read` | operations tenant/branch |
| GET | `/api/v1/leaves/:id` | `leave:read` | operations tenant/branch |
| PATCH | `/api/v1/leaves/:id/approve` | `leave:approve` | operations tenant/branch; impact + projection in the same transaction |
| PATCH | `/api/v1/leaves/:id/reject` | `leave:reject` | operations tenant/branch; bodyless decision command |

Own-scope history is scoped by the server-resolved teacher; a client-supplied
`teacherId` query parameter is rejected (BOLA). `teacherId` in a create body is
rejected as a non-whitelisted field.

## Calendar window (tenant time zone)

The request window is validated **before** any row is written, in the tenant's
`tenants.timezone`:

- `start < end` and the total range cannot exceed 366 days.
- `hourly`: <= 24 hours and at most one local day boundary.
- `full_day`: both ends at local midnight, exactly one local calendar day.
- `multi_day`: both ends at local midnight, at least two local calendar days.
- An unknown/invalid tenant time zone fails closed (`400`); UTC is never assumed.

Midnight alignment is computed from local calendar parts, so a DST day (23 or 25
hours) still counts as one full day. The repository takes a transaction-scoped
PostgreSQL advisory lock on `(tenant, branch:teacher)` before the overlap select,
so two concurrent requests for the same teacher cannot both pass the TOCTOU check.

## On-behalf policy

On-behalf creation is not supported: a manager cannot open a leave request for
another teacher through this surface. `teacherId` and `requesterUserId` are never
accepted from the client; the identity is resolved from the authenticated JWT
(`#141`). This is an explicit policy, not a silent override.


Decision endpoints require exact resource-bound `If-Match: "leave:<id>:v<version>"`.
An ETag issued for another leave request is rejected. The repository repeats the
version and terminal-state checks while holding the pessimistic write lock so a
concurrent loser receives `412` rather than the winning mutation as success.

## Transaction and audit

- Creation validates `(tenant_id, branch_id)` ownership inside the mutation transaction.
- Domain mutation, canonical audit insert and idempotent outbox insert use the same
  transaction-scoped `EntityManager`.
- Canonical audit events are `leave.requested.v1`, `leave.approved.v1` and
  `leave.rejected.v1` through `TransactionalLeaveAuditAdapter` and the shared
  `audit_logs` writer.
- A separate `leave_audit_events` store is prohibited.
- Audit failure propagates and rolls back the domain mutation.

## Security and privacy

- Permission-bearing routes authenticate JWT before global permission evaluation.
- `teacherId` is not accepted from client payload.
- Own-scope requires the #141 server-side User -> Teacher identity link.
- Cross-tenant and nonexistent records return the same `404 Leave request not found`.
- Request owner cannot approve or reject their own request.
- Reject callers do not provide a decision enum; the route selects `rejected` server-side.
- Audit and outbox payloads must not contain names, email, phone, free-text reason,
  health detail, raw DTO or raw entity.
- Runtime is fail-closed until #141 provides the identity resolver.
- Approval is fail-closed until #160 Schedule acceptance and transactional impact/
  Daily Operations persistence are available.

## Out of scope

Substitution assignment, replacement candidate calculation, Schedule impact write,
Daily Operations projection, SMS/email delivery, frontend, demo fixture and automatic
approval. These are not simulated by returning an approval success.
