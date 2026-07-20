# M2 TimeSlot Runtime Contract

Status: **PRE-GATE FINAL PASS / DRAFT IMPLEMENTATION AUTHORIZED / MERGE NOT AUTHORIZED**

References: #86, #66

## Scope

This slice is limited to the TimeSlot domain.

Included:

- tenant- and branch-scoped TimeSlot CRUD
- list, detail and calendar-definition reads
- create, update, archive and reactivate lifecycle
- RBAC, audit, migration and negative-path tests

Excluded:

- Schedule integration
- Room, Teacher, StudentGroup, Student or Parent Contact changes
- frontend binding
- bulk import or reporting
- generic CRUD framework or broad refactor

## Product contract

- Active duplicate within the same tenant, branch, day, start and end time returns `409 Conflict`.
- Active overlap within the same tenant, branch and day returns `422 Unprocessable Entity`.
- Hard delete is not exposed.
- Archive/reactivate is the lifecycle mechanism.

## Architecture contract

- Base branch: `main`
- Runtime branch: `m2/time-slot-runtime`
- API root: `/api/v1/time-slots`
- Layers: `controller -> service -> tenant-scoped repository`
- DTO, entity and response mapping remain separate.
- `tenant_id` is taken from authenticated request context and is not accepted from client payloads.
- `branch_id` must reference an active Branch in the same tenant.
- Cross-tenant and nonexistent resources return the same non-enumerating `404` behavior.
- Route UUIDs require explicit validation.
- No generic `BaseCrud` abstraction.
- No Schedule runtime dependency.

## Database contract

Required data rules:

- `day_of_week BETWEEN 1 AND 7`
- `end_time > start_time`
- composite FK: `(tenant_id, branch_id) -> branches(tenant_id, id)`
- active duplicate protection for tenant + branch + day + start/end
- supporting index for tenant + branch + day + status + order

## Overlap strategy

Phase 1 uses **service transaction + tenant/branch/day scoped overlap query**.

Create, update and reactivate must perform overlap validation and the write inside the same transaction. Update and reactivate exclude the current TimeSlot ID.

A PostgreSQL exclusion constraint is deferred because it introduces range/GiST/extension and migration complexity before Schedule semantics are mature.

## QA, KVKK and security contract

Required evidence includes:

- missing tenant context rejected before repository access
- cross-tenant TimeSlot and Branch access hidden as `404`
- invalid route UUID rejected before DB access
- inactive or cross-tenant Branch rejected
- invalid day and time-range tests
- duplicate `409` and overlap `422` tests
- teacher create/update/archive/calendar-definition access denied
- audit allowlist for create, update, archive, reactivate and denied access
- no raw request or response payloads in audit records
- KVKK classification: `PII yok / low risk`
- Sensitive Pattern Scanner, GitGuardian and governance checks successful before merge

## Migration and rollback

Migration must include `up()` and `down()`.

Required real database sequence before merge:

```bash
npm run db:migrate
npm run db:verify
npm run db:migrate:revert
npm run db:verify
npm run db:migrate
npm run db:verify
```

Application rollback:

```bash
git revert <merge_commit_sha>
```

## Gate rule

The Draft PR may be opened after Product Owner, Technical Architecture and QA/KVKK/Security final PASS decisions.

Merge remains HOLD until the implementation diff, tests, migration cycle, scanners, governance checks and review threads are all complete and successful.
