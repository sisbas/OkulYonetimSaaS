# M3 Schedule Contract v1

- **Contract ID:** `M3_CONTRACT_V1`
- **Semantic version:** `1.0.0`
- **Authority:** Issue #107
- **Status:** contract-only source of truth; runtime implementation remains blocked
- **Scope:** Schedule API, validator, ScheduleEvent references, frontend reason/state mapping, permissions and visibility
- **Out of scope:** runtime controller/service/repository, migration, API binding, solver, optimization and soft constraints

## 1. Frozen invariants

1. `INCREMENTAL` validation produces editor feedback only and is never publish evidence.
2. Publish always executes or verifies `FULL` validation for the current Schedule revision.
3. Any Schedule or ScheduleEvent revision change makes prior validation evidence stale.
4. Validation evidence is bound to `tenantId + branchId + scheduleId + scheduleRevision + validatorVersion + inputFingerprint`.
5. Published Schedule and ScheduleEvent records are immutable.
6. Empty, stale, hard-conflict and published-period-conflict outcomes remain separate reason codes and UI states.
7. Teacher and Viewer cannot discover draft or unpublished schedules.
8. Tenant/branch mismatches use non-enumerating public responses.

## 2. ScheduleEvent reference contract

All references are required and non-null:

```ts
interface ScheduleEventReferenceContractV1 {
  teacherId: UUIDv4;
  teacherBranchId: UUIDv4;
  studentGroupId: UUIDv4;
  courseId: UUIDv4;
  roomId: UUIDv4;
  timeSlotId: UUIDv4;
}
```

Canonical storage names:

```text
teacher_id NOT NULL
teacher_branch_id NOT NULL
student_group_id NOT NULL
course_id NOT NULL
room_id NOT NULL
time_slot_id NOT NULL
```

`teacher_branch_id` proves the assignment context. It must reference an active assignment where:

```text
teacher_branch.teacher_id = schedule_event.teacher_id
teacher_branch.branch_id = schedule.branch_id
teacher_branch.tenant_id = schedule.tenant_id
```

TeacherCourse expertise is not a ScheduleEvent FK in v1. It is a validator dependency resolved from an active `teacherId + courseId` relation. Missing expertise yields `TEACHER_COURSE_MISMATCH`.

## 3. TimeSlot historical snapshot

Each ScheduleEvent keeps the live `timeSlotId` reference and an immutable snapshot:

```ts
interface TimeSlotSnapshotV1 {
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  startTime: `${number}${number}:${number}${number}`;
  endTime: `${number}${number}:${number}${number}`;
  label: string | null;
  orderIndex: number | null;
  sourceTimeSlotUpdatedAt: ISODateTime;
}
```

The snapshot is the canonical interval for conflict calculation and historical published reads. Reference validity of `timeSlotId` is still checked independently. A current TimeSlot change invalidates prior draft validation evidence but does not rewrite published history.

## 4. FULL and INCREMENTAL validation

| Rule | FULL | INCREMENTAL |
| --- | --- | --- |
| Purpose | Authoritative publish gate | Editor feedback |
| Input scope | Entire Schedule and all dependencies | Affected events plus comparison candidates |
| Publish evidence | Yes | **No** |
| Evidence status | `authoritative` | `editor_feedback` |
| `canPublish` | Conditional | Always `false` |
| Current revision required | Yes | Yes |
| Input fingerprint | Entire Schedule input | Affected input set |
| Resource conflicts | Yes | Yes |
| Reference validity | Yes | Affected references |
| Empty Schedule | Yes | No publish decision |
| Published-period conflict | Yes | No publish decision |

`FULL` can produce `canPublish=true` only when the Schedule is a non-empty draft, the revision and fingerprint are current, no hard/reference-invalid reasons exist and no published-period conflict exists.

## 5. Canonical reason-code catalog

| Reason code | Severity | HTTP | Mutation applied? | Publish blocked? | FULL | INCREMENTAL | UI state | Safe user message | Audit event/reason | Disclosure risk |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| `TEACHER_TIME_OVERLAP` | error | 422 | No | Yes | Yes | Yes | `event_conflict_teacher` | Öğretmen seçilen zaman aralığında başka bir derse atanmış. | `schedule.validation_failed` / same code | Low |
| `STUDENT_GROUP_TIME_OVERLAP` | error | 422 | No | Yes | Yes | Yes | `event_conflict_group` | Öğrenci grubu seçilen zaman aralığında başka bir derse atanmış. | same | Low |
| `ROOM_TIME_OVERLAP` | error | 422 | No | Yes | Yes | Yes | `event_conflict_room` | Derslik seçilen zaman aralığında kullanılıyor. | same | Low |
| `TIMESLOT_INACTIVE` | error | 422 | No | Yes | Yes | Yes | `reference_timeslot_inactive` | Seçilen zaman dilimi aktif değil. | same | Medium; authorized same-scope actor only |
| `TEACHER_INACTIVE` | error | 422 | No | Yes | Yes | Yes | `reference_teacher_inactive` | Seçilen öğretmen aktif değil. | same | Medium; authorized same-scope actor only |
| `STUDENT_GROUP_INACTIVE` | error | 422 | No | Yes | Yes | Yes | `reference_group_inactive` | Seçilen öğrenci grubu aktif değil. | same | Medium; authorized same-scope actor only |
| `TEACHER_BRANCH_ASSIGNMENT_MISSING` | error | 422 | No | Yes | Yes | Yes | `reference_teacher_branch_missing` | Öğretmenin bu şube için aktif görevlendirmesi bulunmuyor. | same | Medium |
| `TEACHER_COURSE_MISMATCH` | error | 422 | No | Yes | Yes | Yes | `reference_teacher_course_mismatch` | Öğretmen seçilen ders için geçerli branş eşleşmesine sahip değil. | same | Medium |
| `TENANT_REFERENCE_MISMATCH` | security | 404 | No | Yes | Yes | Yes | `reference_not_found` | İlgili kayıt bulunamadı. | internal same code; public `REFERENCE_NOT_FOUND` | High; canonical code is not exposed publicly |
| `BRANCH_REFERENCE_MISMATCH` | security | 404 | No | Yes | Yes | Yes | `reference_not_found` | İlgili kayıt bulunamadı. | internal same code; public `REFERENCE_NOT_FOUND` | High; canonical code is not exposed publicly |
| `PUBLISHED_SCHEDULE_IMMUTABLE` | error | 409 | No | Yes | Yes | Yes | `published_read_only` | Yayınlanmış program değiştirilemez. Yeni taslak oluşturun. | `schedule.mutation_denied` / same code | Low |
| `SCHEDULE_EMPTY` | error | 422 | N/A | Yes | Yes | No | `publish_blocked_empty` | Boş program yayınlanamaz. | `schedule.publish_denied` / same code | Low |
| `SCHEDULE_VALIDATION_STALE` | error | 422 | Publish not applied | Yes | Yes | No | `publish_blocked_stale` | Program değiştiği için doğrulama güncel değil. | same | Low |
| `SCHEDULE_HARD_CONFLICTS_PRESENT` | error | 422 | Publish not applied | Yes | Yes | No | `publish_blocked_conflicts` | Programdaki zorunlu çatışmalar giderilmeden yayınlanamaz. | same | Low |
| `PUBLISHED_SCHEDULE_PERIOD_CONFLICT` | error | 409 | Publish not applied | Yes | Yes | No | `publish_blocked_period` | Bu şube ve tarih aralığında başka bir yayınlanmış program bulunuyor. | same | Medium; authorized branch actor only |
| `SCHEDULE_VERSION_MISMATCH` | error | 412 | No | Yes | Yes | Yes | `stale_version` | Program başka bir işlemle güncellendi. Ekranı yenileyin. | `schedule.mutation_denied` / same code | Low |
| `SCHEDULE_VERSION_REQUIRED` | error | 428 | No | Yes | Yes | Yes | `version_required` | İşlem için güncel program sürümü gerekli. | same | Low |

### Public non-enumerating projection

`TENANT_REFERENCE_MISMATCH` and `BRANCH_REFERENCE_MISMATCH` may exist internally for validator and audit diagnostics. Unauthorized clients receive only:

```json
{
  "statusCode": 404,
  "code": "REFERENCE_NOT_FOUND",
  "message": "Referenced resource not found",
  "requestId": "req_..."
}
```

The public response must not reveal whether the reference exists in another tenant or branch.

## 6. Validator input schema

```ts
type ValidationModeV1 = 'FULL' | 'INCREMENTAL';

interface ScheduleValidationInputV1 {
  contractVersion: 'M3_CONTRACT_V1';
  validatorVersion: string;
  mode: ValidationModeV1;

  tenantId: UUIDv4;
  branchId: UUIDv4;
  scheduleId: UUIDv4;
  scheduleRevision: number;
  requestedByActorId: UUIDv4;
  inputFingerprint: string;

  affectedEventIds?: UUIDv4[];

  schedule: {
    status: 'draft' | 'published' | 'unpublished';
    effectiveFrom: ISODate;
    effectiveTo: ISODate | null;
  };

  events: ScheduleValidationEventV1[];

  references: {
    activeTeacherIds: UUIDv4[];
    activeStudentGroupIds: UUIDv4[];
    activeTimeSlotIds: UUIDv4[];
    activeTeacherBranchAssignments: Array<{
      teacherBranchId: UUIDv4;
      teacherId: UUIDv4;
      branchId: UUIDv4;
    }>;
    activeTeacherCourseRelations: Array<{
      teacherId: UUIDv4;
      courseId: UUIDv4;
      relationVersion: string;
    }>;
  };
}

interface ScheduleValidationEventV1 {
  eventId: UUIDv4;
  teacherId: UUIDv4;
  teacherBranchId: UUIDv4;
  studentGroupId: UUIDv4;
  courseId: UUIDv4;
  roomId: UUIDv4;
  timeSlotId: UUIDv4;
  timeSlotSnapshot: TimeSlotSnapshotV1;
}
```

## 7. Validator output schema

```ts
interface ScheduleValidationOutputV1 {
  contractVersion: 'M3_CONTRACT_V1';
  validatorVersion: string;
  validationId: UUIDv4;
  mode: ValidationModeV1;

  tenantId: UUIDv4;
  branchId: UUIDv4;
  scheduleId: UUIDv4;
  scheduleRevision: number;
  inputFingerprint: string;

  status: 'valid' | 'invalid';
  evidenceStatus: 'authoritative' | 'editor_feedback';
  canPublish: boolean; // always false for INCREMENTAL
  hardConflictCount: number;
  reasons: ValidationReasonV1[];
  validatedAt: ISODateTime;
}

interface ValidationReasonV1 {
  code: CanonicalScheduleReasonCode;
  severity: 'error' | 'security';
  eventId?: UUIDv4;
  conflictingEventId?: UUIDv4;
  resourceType?: 'teacher' | 'student_group' | 'room' | 'time_slot' | 'schedule';
  resourceId?: UUIDv4; // may be redacted from the client projection
  uiState: CanonicalScheduleUiState;
  safeMessage: string;
}
```

## 8. API HTTP/code matrix

| Endpoint | Success | Permission | Primary errors |
| --- | ---: | --- | --- |
| `POST /api/v1/schedules/drafts` | 201 | `schedule:draft:create` | 400 validation, 404 non-enumerating reference, 409 policy conflict |
| `POST /api/v1/schedules/:scheduleId/events` | 201 | `schedule:draft:update` | 404, 409 immutable, 412 mismatch, 422 conflict/reference, 428 required |
| `PATCH /api/v1/schedules/:scheduleId/events/:eventId` | 200 | `schedule:draft:update`; assignment change also requires `schedule:assignment:update` | 404, 409, 412, 422, 428 |
| `DELETE /api/v1/schedules/:scheduleId/events/:eventId` | 204 | `schedule:draft:update` | 404, 409, 412, 428 |
| `POST /api/v1/schedules/:scheduleId/conflicts/validate` | 200 | `schedule:validate` + `schedule:conflict:read` | 404, 412, 428 |
| `POST /api/v1/schedules/:scheduleId/publish` | 200 | `schedule:publish` | 404, 409 period/state, 412, 422 empty/stale/conflicts, 428 |
| `POST /api/v1/schedules/:scheduleId/unpublish` | 200 | `schedule:publish` | 404, 409 state, 412, 428 |
| `GET /api/v1/schedules/published` | 200 | `schedule:read` or `schedule:own:read` | 403 own-scope, 404 published not found |

All mutation endpoints require:

```http
If-Match: "schedule:<scheduleId>:v<revision>"
```

Missing header: `428 SCHEDULE_VERSION_REQUIRED`. Stale header: `412 SCHEDULE_VERSION_MISMATCH`.

## 9. UI reason/state mapping

| Reason code | UI state |
| --- | --- |
| `TEACHER_TIME_OVERLAP` | `event_conflict_teacher` |
| `STUDENT_GROUP_TIME_OVERLAP` | `event_conflict_group` |
| `ROOM_TIME_OVERLAP` | `event_conflict_room` |
| `TIMESLOT_INACTIVE` | `reference_timeslot_inactive` |
| `TEACHER_INACTIVE` | `reference_teacher_inactive` |
| `STUDENT_GROUP_INACTIVE` | `reference_group_inactive` |
| `TEACHER_BRANCH_ASSIGNMENT_MISSING` | `reference_teacher_branch_missing` |
| `TEACHER_COURSE_MISMATCH` | `reference_teacher_course_mismatch` |
| `TENANT_REFERENCE_MISMATCH` | `reference_not_found` |
| `BRANCH_REFERENCE_MISMATCH` | `reference_not_found` |
| `PUBLISHED_SCHEDULE_IMMUTABLE` | `published_read_only` |
| `SCHEDULE_EMPTY` | `publish_blocked_empty` |
| `SCHEDULE_VALIDATION_STALE` | `publish_blocked_stale` |
| `SCHEDULE_HARD_CONFLICTS_PRESENT` | `publish_blocked_conflicts` |
| `PUBLISHED_SCHEDULE_PERIOD_CONFLICT` | `publish_blocked_period` |
| `SCHEDULE_VERSION_MISMATCH` | `stale_version` |
| `SCHEDULE_VERSION_REQUIRED` | `version_required` |

Draft and published grids are distinct states:

```text
weekly_grid_ready_draft
weekly_grid_ready_published
```

`publish_blocked_empty`, `publish_blocked_stale`, `publish_blocked_conflicts` and `publish_blocked_period` must never collapse into one generic reason.

## 10. Permission and visibility matrix

| Capability | Permission | Tenant Admin | Operations Manager | Teacher | Viewer |
| --- | --- | ---: | ---: | ---: | ---: |
| Draft create | `schedule:draft:create` | Yes | Yes | No | No |
| Draft/event edit | `schedule:draft:update` | Yes | Yes | No | No |
| Assignment edit | `schedule:assignment:update` | Yes | Yes | No | No |
| FULL/INCREMENTAL validate | `schedule:validate` | Yes | Yes | No | No |
| Conflict details | `schedule:conflict:read` | Yes | Yes | No | No |
| Publish/unpublish | `schedule:publish` | Yes | Yes | No | No |
| Published branch read | `schedule:read` | Yes | Yes | No | Only if a catalog permission is approved later |
| Published own read | `schedule:own:read` | Yes | Yes | Yes | No |
| Draft discovery | management permissions | Yes | Yes | **Hidden** | **Hidden** |

Permission enforcement is permission-key based, never inferred from a role name. No Viewer permission key is invented in this contract. Until a catalog key is approved, Viewer published access remains hidden.

Teacher receives only the actor-bound published projection and cannot discover drafts, unpublished schedules, another teacher's events or another branch.

## 11. OpenAPI and TypeScript descriptor

```ts
export const M3_CONTRACT_V1 = {
  id: 'M3_CONTRACT_V1',
  version: '1.0.0',
  apiPrefix: '/api/v1',
  scheduleEventRequiredReferences: [
    'teacherId',
    'teacherBranchId',
    'studentGroupId',
    'courseId',
    'roomId',
    'timeSlotId',
  ],
  validationModes: ['FULL', 'INCREMENTAL'],
  incrementalIsPublishEvidence: false,
  publishedScheduleImmutable: true,
  publishRequires: {
    validationMode: 'FULL',
    currentScheduleRevision: true,
    currentInputFingerprint: true,
    nonEmptySchedule: true,
    hardConflictCount: 0,
    referenceErrorCount: 0,
    publishedPeriodConflict: false,
  },
} as const;
```

OpenAPI descriptors must declare `If-Match` on mutations, discriminate FULL/INCREMENTAL output, expose the common safe error envelope and keep security-only internal mismatch reasons out of public schemas.

## 12. Static contract consistency requirements

The repository test must fail when any of the following drifts occur:

- A required canonical reason code is missing.
- `SCHEDULE_VERSION_REQUIRED` is missing.
- Empty, stale, hard-conflict and period-conflict states collapse.
- `INCREMENTAL` can be publish evidence or emit `canPublish=true`.
- `teacherBranchId` or `teacher_branch_id NOT NULL` is removed.
- TimeSlot historical snapshot fields are removed.
- Non-enumerating tenant/branch mismatch behavior is removed.
- Teacher or Viewer draft discovery becomes visible.
- Contract ID/version/change-control rules are removed.

## 13. Contract versioning and change control

1. This file is the repository source of truth for M3 Contract v1.
2. Contract changes require a dedicated contract-only PR referencing Issue #107 or its successor change request.
3. Every change must include a semantic version decision:
   - patch: wording or non-behavioral clarification;
   - minor: backward-compatible field/reason addition;
   - major: breaking endpoint, schema, permission, visibility or reason semantics.
4. API, validator, frontend state and QA fixtures must reference the same contract ID and version.
5. Runtime or migration code is prohibited in a contract-freeze PR.
6. Required sign-off: Product/PO, Technical Architecture, Data Model, Frontend and QA/KVKK/Security.
7. No runtime branch may consume a changed contract until static consistency checks and all required sign-offs pass.

## 14. Audit guardrails

Allowed metadata is limited to IDs, revision, validator version, fingerprint, mode, result, request ID and canonical reason code. Raw request/response bodies, ScheduleEvent collections, PII, credentials, SQL and cross-tenant existence details are prohibited.

## Decision

```text
M3 CONTRACT V1 REPOSITORY SOURCE OF TRUTH
CONTRACT-ONLY REVIEW
M3 RUNTIME HOLD
```
