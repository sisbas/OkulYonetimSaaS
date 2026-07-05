# Tenant Repository Guard Standard

Repository-level tenant isolation is the final data-access defense for tenant-scoped tables. Runtime repository methods for tenant-scoped tables must receive `RequestContext` and must call `assertTenantScope(ctx, resourceName)` before issuing a query.

## Data layer

- ORM/data layer: TypeORM 0.3 with PostgreSQL migrations.
- DataSource/client: `AppDataSource` in `src/database/data-source.ts`.
- Current repository pattern: migrations and services use TypeORM directly; `BaseTenantRepository` is the minimum standard helper for tenant-scoped runtime repositories.

## Context source

Tenant IDs must come from `RequestContext.tenantId`, never directly from route params, query params, or request bodies inside repositories.

## Tenant-scoped tables

New runtime repositories for these tables must extend or follow `BaseTenantRepository` contract: `branches`, `tenant_settings`, `tenant_memberships`, `roles`, `user_roles`, `user_sessions`, `audit_logs`, `teachers`, `teacher_branch_assignments`, `courses`, `rooms`, `student_groups`, `students`, `time_slots`, `teacher_availability`, `group_course_requirements`, `schedule_drafts`, `schedule_draft_events`, `published_schedules`, `published_schedule_events`, `leave_requests`, `leave_request_impacts`, `substitution_assignments`, `attendance_sessions`, `attendance_records`, `message_templates`, `parent_notifications`, `kvkk_consent_subjects`, `kvkk_consents`, and `kvkk_consent_events`.

## Global exceptions

`users`, `permissions`, and TypeORM migration metadata are global and must not be tenant-scoped. Tenant-related user listing must join/scope through `tenant_memberships.tenant_id = ctx.tenantId`.

## Bypass policy

Tenant scope bypass is allowed only in migrations, permission seed, system bootstrap, and test setup. Runtime repositories must not expose unsafe bypass helpers.
