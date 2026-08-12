# M3A Pre-Gate: Parent Composite Contract Matrix

## Authority and scope

- Parent readiness issue: #106
- Evidence issues: #111 (Course parent prerequisite), #112 (TeacherBranch preflight)
- Tracker: #105
- Purpose: register every parent-owned tenant composite unique/index, verify child-migration
  ownership compliance, record the ScheduleEvent FK prerequisite list and surface the open
  contract decisions that gate migration/runtime GO.

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
| 11 | `rooms` | `uq_rooms_tenant_branch_code` / `uq_rooms_tenant_branch_name` | `UNIQUE (tenant_id, branch_id, lower(...))` partial active | `1784022680000-CreateRoomsTable` + `1784050500000-RoomSecurityHotfix` | base |
| 12 | `time_slots` | `uq_time_slots_active_interval` | `UNIQUE (tenant_id, branch_id, day_of_week, start_time, end_time) WHERE status = 'active'` | `1784520000000-CreateTimeSlotsTable` | base |
| 13 | `student_groups` | `uq_student_groups_tenant_id` | `UNIQUE (tenant_id, id)` | `1784690000000-CreateStudentGroupReferenceFoundation` | base |
| 14 | `student_groups` | `uq_student_groups_branch_id` | `UNIQUE (tenant_id, branch_id, id)` | `1784690000000-CreateStudentGroupReferenceFoundation` | base |
| 15 | `student_groups` | `uq_student_groups_active_code` | `UNIQUE (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL AND deleted_at IS NULL` | `1784690000000-CreateStudentGroupReferenceFoundation` | base |
| 16 | `teachers` | `uq_teachers_tenant_id` | `UNIQUE (tenant_id, id)` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 17 | `teachers` | `uq_teachers_active_tenant_user` | `UNIQUE (tenant_id, user_id) WHERE user_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 18 | `teachers` | `uq_teachers_active_employee_code` | `UNIQUE (tenant_id, lower(employee_code)) WHERE ...` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 19 | `teacher_branches` | `uq_teacher_branches_tenant_id` | `UNIQUE (tenant_id, id)` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 20 | `teacher_branches` | `uq_teacher_branches_schedule_fk` | `UNIQUE (tenant_id, branch_id, teacher_id, id)` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 21 | `teacher_branches` | `ex_teacher_branches_active_period` | `EXCLUDE gist (tenant_id, teacher_id, branch_id, daterange(...) &&) WHERE status = 'active' AND deleted_at IS NULL` | `1800000000000-CreateIdentityTeacherReferenceFoundation` | base |
| 22 | `teacher_courses` | `uq_teacher_courses_tenant_id` | `UNIQUE (tenant_id, id)` | `1803000000000-CreateTeacherCourseEligibility` | base |
| 23 | `teacher_courses` | `uq_teacher_courses_active_exact_period` | `UNIQUE (tenant_id, teacher_id, course_id, effective_from, COALESCE(...)) WHERE active` | `1803000000000-CreateTeacherCourseEligibility` | base |
| 24 | `schedule_versions` | `uq_schedule_versions_no` | `UNIQUE (schedule_id, version_no)` | `1784700000000-CreateScheduleMinimumPublish` | base |
| 25 | `schedule_versions` | `uq_schedule_published_period` | `UNIQUE (tenant_id, branch_id, schedule_id) WHERE status = 'published'` | `1784700000000-CreateScheduleMinimumPublish` | base |

### Missing canonical parent surfaces

Four ScheduleEvent FK targets currently lack a canonical parent-owned `(tenant_id, branch_id, id)`
unique index in the parent table's own migration family:

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

**Status: violates #106 acceptance criterion "Child migration parent-owned index oluşturmuyor
veya silmiyor".** Four indexes are redundant duplicates of canonical parent indexes; four are
gap-fillers that have no canonical owner yet.

**Recommended bounded remediation:** a parent-owned follow-up migration family that

1. verifies each canonical parent index exists and is exactly defined,
2. creates the four missing canonical parent indexes (`rooms`, `time_slots`, `schedules`,
   `schedule_versions`) in the parent table's own migration family,
3. drops the redundant `uq_schedule_repair_*` duplicates,
4. removes the `uq_schedule_repair_*` create/drop statements from
   `1801000000000-EnforceScheduleReferenceIntegrity` (or leaves them only for the four gap
   fillers until step 2 lands),
5. produces the real-PostgreSQL migrate → verify → revert → migrate cycle evidence.

Until remediation, #106 criterion 2 remains HOLD for the Schedule child migration.

### Compliant slices

- Course parent prerequisite (#111): `uq_courses_tenant_id` is created and verified only by the
  Course-owned follow-up migration; `down()` is child-constraint-aware and non-destructive.
- Identity teacher foundation: preflights the required Course/Branch parent surfaces and creates
  only `teachers` / `teacher_branches` owned indexes.
- TeacherBranch read-only preflight (#112): pure function, zero persistence surface.

## ScheduleEvent FK prerequisite list

From `1784700000000-CreateScheduleMinimumPublish` and `1801000000000-EnforceScheduleReferenceIntegrity`:

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
PARENT COMPOSITE OWNER MATRIX: PARTIAL
  - Course prerequisite: PASS (evidence #111)
  - TeacherBranch preflight: PASS (evidence #112)
  - Schedule child ownership: VIOLATION (uq_schedule_repair_* on parents)
  - rooms/time_slots/schedules/schedule_versions canonical parents: MISSING
TEACHER ARCHIVE ATOMICITY: NOT CONTRACTED
STUDENTGROUP IMMUTABILITY: NOT CONTRACTED
QA/KVKK/SECURITY PRE-GATE: PENDING
MIGRATION/RUNTIME: HOLD
```

Issue #106 must not grant migration/runtime GO until the Schedule ownership violation is
remediated and the two open contract decisions are recorded.
