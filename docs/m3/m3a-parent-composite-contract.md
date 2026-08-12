# M3A Pre-Gate: Parent Composite Contract Matrix

## Authority and scope

- Parent readiness issue: #106
- Evidence issues: #111 (Course parent prerequisite), #112 (TeacherBranch preflight)
- Tracker: #105
- Purpose: register every parent-owned composite index and constraint — including
  non-tenant-scoped entries such as `uq_schedule_versions_no` and exclusion constraints such as
  `ex_teacher_branches_active_period` — verify child-migration ownership compliance, record the
  ScheduleEvent FK prerequisite list and surface the open contract decisions that gate
  migration/runtime GO.

## Parent composite ownership matrix

| # | Parent table | Index / constraint | Definition | Owner migration | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | `branches` | `uq_branches_tenant_code` | `UNIQUE (tenant_id, code)` | `1700000000003-CreateBranches` | base |
| 2 | `branches` | `uq_branches_tenant_id` | `UNIQUE (tenant_id, id)` | `1700000000003-CreateBranches` | preflighted by `1784520000000`, `1800000000000` |
| 3 | `tenant_settings` | `uq_tenant_settings_tenant` | `UNIQUE (tenant_id)` | `1700000000004-CreateTenantSettings` | base |
| 4 | `tenant_memberships` | `uq_tenant_memberships_tenant_user` | `UNIQUE (tenant_id, user_id)` | `1700000000006-CreateTenantMemberships` | base |
| 5 | `roles` | `uq_roles_tenant_name` | `UNIQUE (tenant_id, name)` | `1700000000007-CreateRolesPermissions` | base |
| 6 | `roles` | `uq_roles_tenant_id_id` | `UNIQUE (tenant_id, id)` | `1700000000007-CreateRolesPermissions` | base |
| 7 | `kvkk_consent_subjects` | `uq_kvkk_consent_subjects_tenant_id_id` | `UNIQUE (tenant_id, id)` | `1700000000010-CreateKvkkConsents` | base |
| 8 | `kvkk_consents` | `uq_kvkk_consents_tenant_id_id` | `UNIQUE (tenant_id, id)` | `1700000000010-CreateKvkkConsents` | base |
| 9 | `courses` | `uq_courses_tenant_code` | `UNIQUE (tenant_id, lower(code)) WHERE code IS NOT NULL` | `1784022660000-CreateCoursesTable` | base |
| 10 | `courses` | `uq_courses_tenant_id` | `UNIQUE (tenant_id, id)` | `1784577600000-AddCourseTenantIdCompositeUnique` (Course-owned follow-up) | #111 |
| 11 | `rooms` | `uq_rooms_tenant_branch_code_active` / `uq_rooms_tenant_branch_name_active` | `UNIQUE (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL AND status = 'active'` / `UNIQUE (tenant_id, branch_id, lower(name)) WHERE status = 'active'` | `1784050500000-RoomSecurityHotfix` (replaces the non-active `uq_rooms_tenant_branch_code` created by `1784022680000-CreateRoomsTable`) | base |
| 12 | `time_slots` | `uq_time_slots_active_interval` | `UNIQUE (tenant_id, branch_id, day_of_week, start_time, end_time) WHERE status = 'active'` | `1784520000000-CreateTimeSlotsTable` | base |
| 13 | `student_groups` | `uq_student_groups_tenant_id` | `UNIQUE (tenant_id, id)` | `1784690000000-CreateStudentGroupReferenceFoundation` | base |
| 14 | `student_groups` | `uq_student_groups_branch_id` | `UNIQUE (tenant_id, branch_id, id)` | `1784690000000-CreateStudentGroupReferenceFoundation` | base |
| 15 | `student_groups` | `uq_student_groups_active_code` | `UNIQUE (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL AND deleted_at IS NULL` | `1784690000000-CreateStudentGroupReferenceFoundation` | base |
| 16 | `teachers` | `uq_teachers_tenant_id` | `UNIQUE (tenant_id, id)` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 17 | `teachers` | `uq_teachers_active_tenant_user` | `UNIQUE (tenant_id, user_id) WHERE user_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 18 | `teachers` | `uq_teachers_active_employee_code` | `UNIQUE (tenant_id, lower(employee_code)) WHERE employee_code IS NOT NULL AND status = 'active' AND deleted_at IS NULL` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 19 | `teacher_branches` | `uq_teacher_branches_tenant_id` | `UNIQUE (tenant_id, id)` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 20 | `teacher_branches` | `uq_teacher_branches_schedule_fk` | `UNIQUE (tenant_id, branch_id, teacher_id, id)` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 21 | `teacher_branches` | `ex_teacher_branches_active_period` | `EXCLUDE USING gist (tenant_id WITH =, teacher_id WITH =, branch_id WITH =, daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&) WHERE (status = 'active' AND deleted_at IS NULL)` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 22 | `teacher_courses` | `uq_teacher_courses_tenant_id` | `UNIQUE (tenant_id, id)` | `1803000000000-CreateTeacherCourseEligibility` | base |
| 23 | `teacher_courses` | `uq_teacher_courses_active_exact_period` | `UNIQUE (tenant_id, teacher_id, course_id, effective_from, COALESCE(effective_to, 'infinity'::date)) WHERE status = 'active' AND deleted_at IS NULL` | `1803000000000-CreateTeacherCourseEligibility` | base |
| 24 | `schedule_versions` | `uq_schedule_versions_no` | `UNIQUE (schedule_id, version_no)` (table constraint, not tenant-scoped) | `1784700000000-CreateScheduleMinimumPublish` | base |
| 25 | `schedule_versions` | `uq_schedule_published_period` | `UNIQUE (tenant_id, branch_id, schedule_id) WHERE status = 'published'` | `1784700000000-CreateScheduleMinimumPublish` | base |

### Missing canonical parent surfaces

Four ScheduleEvent FK targets currently lack the canonical parent-owned unique key that matches
the corresponding ScheduleEvent FK columns:

- `rooms` — no `uq_rooms_tenant_branch_id`
- `time_slots` — no `uq_time_slots_tenant_branch_id` (referenced conditionally by `1784700000000`, line 76)
- `schedules` — no `uq_schedules_tenant_branch_id`
- `schedule_versions` — no `uq_schedule_versions_tenant_branch_schedule_id`

These gaps are currently filled by Schedule-owned repair indexes (see below). The identity
teacher foundation preflight (rows 16–21) and teacher-course eligibility preflight (rows 22–23)
correctly require the Course/Branch parent indexes to exist before creating child tables.

## Child migration compliance

Criterion: child migrations must not create, replace, rename or drop parent-owned indexes.

### Violation: `1801000000000-EnforceScheduleReferenceIntegrity`

A Schedule (child) migration creates the following parent-table indexes and drops them in `down()`:

| Child-created index | Parent table | Definition | Canonical equivalent |
| --- | --- | --- | --- |
| `uq_schedule_repair_courses_tenant_id` | `courses` | `UNIQUE (tenant_id, id)` | ✅ `uq_courses_tenant_id` — redundant duplicate |
| `uq_schedule_repair_teachers_tenant_id` | `teachers` | `UNIQUE (tenant_id, id)` | ✅ `uq_teachers_tenant_id` — redundant duplicate |
| `uq_schedule_repair_teacher_branches_owner` | `teacher_branches` | `UNIQUE (tenant_id, branch_id, teacher_id, id)` | ✅ `uq_teacher_branches_schedule_fk` — redundant duplicate |
| `uq_schedule_repair_student_groups_branch_id` | `student_groups` | `UNIQUE (tenant_id, branch_id, id)` | ✅ `uq_student_groups_branch_id` — redundant duplicate |
| `uq_schedule_repair_rooms_branch_id` | `rooms` | `UNIQUE (tenant_id, branch_id, id)` | ❌ none — gap filler |
| `uq_schedule_repair_time_slots_branch_id` | `time_slots` | `UNIQUE (tenant_id, branch_id, id)` | ❌ none — gap filler |
| `uq_schedule_repair_schedules_owner` | `schedules` | `UNIQUE (tenant_id, branch_id, id)` | ❌ none — gap filler |
| `uq_schedule_repair_versions_owner` | `schedule_versions` | `UNIQUE (tenant_id, branch_id, schedule_id, id)` | ❌ none — gap filler |

**Status: transitional HOLD.** `1801000000000-EnforceScheduleReferenceIntegrity` still violates
#106 acceptance criterion "Child migration parent-owned index oluşturmuyor veya silmiyor": its
repair indexes are transiently created on parent tables during the migrate cycle (and later
removed by the follow-up).

**Remediation (implemented):** `1804000000000-ParentOwnedScheduleSurfaces` is a bounded
follow-up migration that

1. preflights fail-closed: all tables, the four canonical parent indexes
   (`uq_courses_tenant_id`, `uq_teachers_tenant_id`, `uq_teacher_branches_schedule_fk`,
   `uq_student_groups_branch_id`) and all eight `uq_schedule_repair_*` indexes must exist with
   the exact expected definitions (uniqueness + ordered key columns validated via
   `pg_index`/`pg_attribute`),
2. blocks if any canonical parent index already exists — canonical ownership is claimed
   deterministically, so `down()` never drops a pre-existing surface,
3. creates the four missing canonical parent-owned indexes (`rooms`, `time_slots`, `schedules`,
   `schedule_versions`),
4. drops the ten Schedule FK constraints, drops all eight `uq_schedule_repair_*` indexes, and
   re-adds the FKs against the canonical parent surfaces (`ON DELETE RESTRICT`),
5. postcondition-verifies the canonical index definitions, that no `uq_schedule_repair_%`
   remains and the ten-FK contract (source table, target table, delete action),
6. `down()` restores the repair indexes and drops the canonical parent indexes (FKs are
   re-attached to the repair surfaces first).

Real-PostgreSQL migrate → verify → revert → verify → migrate → verify cycle runs in
`.github/workflows/parent-owned-schedule-surfaces-cycle.yml`.

**Remediation is complete only when** `1801000000000-EnforceScheduleReferenceIntegrity` no
longer creates or drops parent-table indexes. Until then the final applied schema owns all
surfaces correctly, but the child migration retains its transient repair blocks — tracked as a
follow-up rewrite. The cycle workflow guards the intermediate and final applied states.

### Compliant slices

- Course parent prerequisite (#111): `uq_courses_tenant_id` is created and verified only by the
  Course-owned follow-up migration; `down()` is child-constraint-aware and non-destructive.
- Identity teacher foundation: preflights the required Course/Branch parent surfaces and creates
  only indexes owned by `teachers` and `teacher_branches`.
- TeacherBranch read-only preflight (#112): pure function, zero persistence surface.

## ScheduleEvent FK prerequisite list

The ten constraints below are created by `1801000000000-EnforceScheduleReferenceIntegrity` (and
re-pointed onto canonical surfaces by `1804000000000`). `1784700000000-CreateScheduleMinimumPublish`
separately creates differently named constraints (`fk_schedule_events_schedule`,
`fk_schedule_events_version`, `fk_schedules_active_version` and optional
`fk_schedule_events_*_same_tenant` preflights); the owner-named constraints below replace that
surface contract:

| FK | Child columns | Parent target | Required parent index | Owner |
| --- | --- | --- | --- | --- |
| `fk_schedule_events_schedule_owner` | `(tenant_id, branch_id, schedule_id)` | `schedules` | `(tenant_id, branch_id, id)` | gap (repair) |
| `fk_schedule_events_version_owner` | `(tenant_id, branch_id, schedule_id, version_id)` | `schedule_versions` | `(tenant_id, branch_id, schedule_id, id)` | gap (repair) |
| `fk_schedule_events_course_tenant` | `(tenant_id, course_id)` | `courses` | `uq_courses_tenant_id` | #111 |
| `fk_schedule_events_time_slot_branch` | `(tenant_id, branch_id, time_slot_id)` | `time_slots` | `(tenant_id, branch_id, id)` | gap (repair) |
| `fk_schedule_events_teacher_tenant` | `(tenant_id, teacher_id)` | `teachers` | `uq_teachers_tenant_id` | base |
| `fk_schedule_events_teacher_branch_owner` | `(tenant_id, branch_id, teacher_id, teacher_branch_id)` | `teacher_branches` | `uq_teacher_branches_schedule_fk` | base |
| `fk_schedule_events_student_group_branch` | `(tenant_id, branch_id, student_group_id)` | `student_groups` | `uq_student_groups_branch_id` | base |
| `fk_schedule_events_room_branch` | `(tenant_id, branch_id, room_id)` | `rooms` | `(tenant_id, branch_id, id)` | gap (repair) |

## Open contract decisions

| Decision | State | Owner |
| --- | --- | --- |
| Teacher archive → active membership deactivation atomicity (single-transaction boundary) | Not contracted | Data Model + Technical Architecture |
| StudentGroup branch immutability and archive/reactivate contract | Not frozen | Data Model + Backend |
| Effective-date overlap transaction/concurrency for backfill | Decided in scanner (overlap → HOLD); write-path decision pending | Pilot Ops + Backend |
| QA/KVKK/Security pre-gate PASS/HOLD | Open (human review) | QA / KVKK / Security |

## Recommendation for issue #106

```text
PARENT COMPOSITE OWNER MATRIX: DOCUMENTED
  - Course prerequisite: PASS (evidence #111)
  - TeacherBranch preflight: PASS (evidence #112)
  - Schedule child ownership: TRANSITIONAL HOLD (final applied state REMEDIATED via
    1804000000000 + cycle workflow; 1801000000000 parent-index rewrite pending)
  - rooms/time_slots/schedules/schedule_versions canonical parents: CREATED
TEACHER ARCHIVE ATOMICITY: NOT CONTRACTED (blocking)
STUDENTGROUP IMMUTABILITY: NOT CONTRACTED (blocking)
EFFECTIVE-DATE WRITE-PATH DECISION: PENDING (blocking)
QA/KVKK/SECURITY PRE-GATE: PENDING (blocking)
MIGRATION/RUNTIME: HOLD
```

Issue #106 must not grant migration/runtime GO until all four blocking rows above are resolved
and recorded: (1) teacher archive atomicity decision, (2) StudentGroup immutability decision,
(3) effective-date overlap write-path decision, (4) QA/KVKK/Security pre-gate sign-off.
