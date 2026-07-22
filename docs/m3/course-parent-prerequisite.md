# Course Parent Prerequisite

## Decision

`uq_courses_tenant_id` is a Course-owned parent prerequisite:

```text
UNIQUE (tenant_id, id)
```

Only the Course base migration or a Course-owned follow-up migration may create, verify or remove this index.

TeacherCourse, Schedule or any other child migration must not create, replace, rename or drop it.

## Scope

This change adds only the parent composite uniqueness surface required by future same-tenant composite foreign keys.

It does not change:

- Course CRUD behavior
- Course tenant isolation
- RBAC permissions or guards
- Course audit events or redaction
- Teacher or TeacherCourse runtime
- Schedule or ScheduleEvent runtime

## Preflight

Migration `up()` fails before schema mutation when any of these conditions is true:

1. `courses` is missing.
2. A Course row has a null identifier or tenant.
3. A Course row references a missing tenant.
4. Duplicate `(tenant_id, id)` rows exist.
5. An object named `uq_courses_tenant_id` exists with a non-unique or wrong-column definition.

No row is deleted, merged, rewritten or silently ignored.

## Up behavior

1. Run the fail-closed data and schema preflight.
2. Create `uq_courses_tenant_id` on `(tenant_id, id)`.
3. Verify that the resulting index is unique and has the exact ordered columns.

## Down behavior

1. Detect child constraints that depend on the Course-owned index.
2. Fail closed if a child dependency exists.
3. Otherwise drop only `uq_courses_tenant_id`.

The Course table and Course rows are never dropped or mutated by this follow-up migration.

## Required evidence

A real PostgreSQL 16 workflow runs:

```text
migrate
→ verify
→ revert
→ verify
→ controlled invalid-index preflight failure
→ migrate
→ verify
```

It also runs:

- Course migration and CRUD regression tests
- database tests
- RBAC tests
- KVKK tests
- audit-redaction tests
- TypeScript build
- repository scanner workflows

## Rollback

Before child foreign keys use the index, the migration can be reverted without row-level data loss.

After a child foreign key depends on the index, rollback is blocked. The child migration must be reverted first. `CASCADE` is prohibited.

## Merge gate

This is a prerequisite-only Draft PR. Merge requires:

- Course Prerequisite Migration Cycle PASS
- Backend CI PASS
- DB Smoke PASS
- Sprint 1 Quality Gate PASS
- Gate 1 CI PASS
- Sensitive Pattern Scanner PASS
- GitGuardian PASS
- Technical Architecture approval
- QA/KVKK/Security approval
- no unresolved review thread

Refs #106
Refs #105
Refs #40
