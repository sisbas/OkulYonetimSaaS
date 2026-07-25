# Leave Management Runtime Contract

Refs #143. Ready/merge depends on #140, #141 and #142 PASS.

## Domain states

- Duration: `hourly`, `full_day`, `multi_day`
- Reason: `annual_leave`, `administrative`, `health`, `other`
- Decision: `pending`, `approved`, `rejected`
- Coverage: `not_required`, `unresolved`, `partially_covered`, `covered`

Decision and coverage are separate state machines. A leave request can be approved
while coverage remains `unresolved`.

## API surface

| Method | Path | Permission | Scope |
|---|---|---|---|
| POST | `/api/v1/leaves/me` | `leave:create` | teacher own |
| GET | `/api/v1/leaves/me/:id` | `leave:own:read` | teacher own |
| GET | `/api/v1/leaves` | `leave:read` | operations tenant/branch |
| GET | `/api/v1/leaves/:id` | `leave:read` | operations tenant/branch |
| PATCH | `/api/v1/leaves/:id/approve` | `leave:approve` | operations tenant/branch |
| PATCH | `/api/v1/leaves/:id/reject` | `leave:reject` | operations tenant/branch |

Decision endpoints require `If-Match: "leave:<id>:v<version>"`.

## Security and privacy

- `teacherId` is not accepted from client payload.
- Own-scope requires the #141 server-side User -> Teacher identity link.
- Cross-tenant and nonexistent records return the same `404 Leave request not found`.
- Request owner cannot approve or reject their own request.
- Audit and outbox payloads must not contain names, email, phone, free-text reason,
  health detail, raw DTO or raw entity.
- Runtime is fail-closed until #141 provides the identity resolver.

## Out of scope

Substitution assignment, replacement candidate calculation, Daily Operations
projection, SMS/email delivery, frontend, demo fixture and automatic approval.
