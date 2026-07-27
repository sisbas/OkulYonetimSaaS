# WP-07E Leave Impact Operations Contract

```text
STATUS: CONTRACT/RUNTIME DRAFT
READY/MERGE HOLD: #166 TeacherCourse Eligibility Foundation PASS required
```

## Scope

Approved Leave → published ScheduleEvent impact, human substitute assignment create/clear, and idempotent Daily Operations lesson projection.

Out of scope: frontend, delivery, solver, demo/builder/full-vision, automatic leave approval, automatic substitute assignment.

## Authority

- Tenant, branch, teacher and course authority are never taken from client payload.
- Leave source: same-tenant approved `leave_requests` only.
- Schedule source: `schedules.status = published`, `active_version_id`, `schedule_versions.status = published`, same-tenant/branch `schedule_events`.
- Course eligibility source: #166 `teacher_courses`; Schedule history inference is forbidden.

## Endpoints

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/daily-operations/leaves/:leaveId/impact` | `leave:impact:read` |
| GET | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/candidates` | `leave:impact:read` |
| POST | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` | `daily_operations:update` |
| DELETE | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` | `daily_operations:update` |
| POST | `/api/v1/daily-operations/leaves/:leaveId/projection/replay` | `daily_operations:update` |

Mutation header:

```http
If-Match: "leave:<leaveId>:v<version>"
```

Missing/invalid version: `428`; stale version: `412`.

## Coverage

`not_required | unresolved | partially_covered | covered`

Coverage is separate from Leave decision. Approved Leave may remain `unresolved`.

## Candidate Filter

Candidate must be same tenant, same active branch, active teacher, no approved-leave overlap, no published schedule time conflict, and course-eligible through `teacher_courses`.

Candidate list is decision support only. It creates no assignment side effect.

## Projection

Projection key:

```text
leave:<leaveRequestId>:version:<scheduleVersionId>:event:<scheduleEventId>
```

`daily_operation_lessons.projection_key` is unique. Replay uses upsert. Assignment clear returns lesson state to `open`.

## KVKK / Audit / Outbox

Allowed payloads: opaque IDs, state, version, controlled event names.

Forbidden: student/parent/teacher PII, free-text leave detail, health detail, raw DTO/entity, request/response body, token/cookie/credential.

Audit events:

```text
leave.substitution_assigned.v1
leave.substitution_cleared.v1
daily_operations.projected.v1
```

Until #166 PASS, candidate response may be non-finalized and assignment create fails closed with `TEACHER_COURSE_ELIGIBILITY_NOT_READY`.
