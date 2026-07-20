# M2 TimeSlot Runtime Contract

Status: **PRE-GATE FINAL PASS / DRAFT IMPLEMENTATION AUTHORIZED / MERGE NOT AUTHORIZED**

References: #86, #66, #99

## Scope

This slice is limited to the TimeSlot domain.

Included:

- tenant- and branch-scoped TimeSlot CRUD
- list, detail and calendar-definition reads
- create, update, archive and reactivate lifecycle
- RBAC, audit, migration and negative-path tests
- tenant + branch + day scoped PostgreSQL transaction locking
- parallel PostgreSQL race-condition tests

Excluded:

- Schedule integration
- Room, Teacher, StudentGroup, Student or Parent Contact changes
- frontend binding
- bulk import or reporting
- generic CRUD framework or broad refactor

## Product contract

- Active duplicate within the same tenant, branch, day, start and end time returns `409 Conflict`.
- Active overlap within the same tenant, branch and day returns `422 Unprocessable Entity`.
- Parallel writes to the same tenant + branch + day scope must produce the same deterministic conflict behavior as sequential writes.
- Hard delete is not exposed.
- Archive/reactivate is the lifecycle mechanism.

## Architecture contract

- Base branch: `main`
- Runtime hardening branch: `fix/time-slot-concurrency-hardening`
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

The shared Branch composite unique index `uq_branches_tenant_id` is a Branch/schema prerequisite. The TimeSlot migration validates this prerequisite but does not create or drop the Branch-owned index.

## Concurrency and overlap strategy

Phase 1 uses **service transaction + tenant/branch/day scoped advisory transaction lock + overlap query**.

- The lock key is derived from tenant ID, branch ID and day of week.
- Lock keys are deduplicated and sorted before acquisition to reduce deadlock risk when an update moves a TimeSlot between scopes.
- Create, update, archive and reactivate participate in the same lock protocol.
- Update, archive and reactivate also lock the target TimeSlot row for update.
- Duplicate and overlap checks execute only after the scoped transaction lock is acquired.
- Advisory locks are transaction-level and are automatically released on commit or rollback.

A PostgreSQL exclusion constraint is deferred because it introduces range/GiST/extension and migration complexity before Schedule semantics are mature.

## QA, KVKK and security contract

Required evidence includes:

- missing tenant context rejected before repository access
- cross-tenant TimeSlot and Branch access hidden as `404`
- invalid route UUID rejected before DB access
- inactive or cross-tenant Branch rejected
- invalid day and time-range tests
- duplicate `409` and overlap `422` tests
- same-scope parallel PostgreSQL transactions block until the first transaction completes
- different-day transactions do not share the same lock scope
- parallel overlap produces one success and one `422`
- parallel exact duplicate produces one success and one `409`
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

The TimeSlot rollback drops only TimeSlot-owned objects. It must not drop or recreate the shared Branch composite index.

Application rollback:

```bash
git revert <merge_commit_sha>
```

## Gate rule

The hardening PR remains Draft until the implementation diff, parallel PostgreSQL tests, migration cycle, scanners, governance checks and review threads are complete and successful.
