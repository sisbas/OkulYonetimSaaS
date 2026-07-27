# WP-07E Leave Impact, Substitution and Daily Operations Projection

## Status

```text
CONTRACT/RUNTIME DRAFT
READY/MERGE HOLD: #166 TeacherCourse Eligibility Foundation PASS required
```

## Scope

This slice calculates approved-leave impact on published Schedule events, supports human-created and human-cleared substitute assignments, and projects open/resolved impacted lessons into the Daily Operations queue.

Out of scope:

- frontend
- SMS/e-mail/WhatsApp delivery
- solver or advanced optimization
- demo/builder/full-vision work
- automatic leave approval
- automatic substitute assignment

## Authority Rules

- Tenant, branch, teacher and course authority are never taken from client payload as source of truth.
- Leave authority is loaded by `tenant_id + leave_request_id` and must be `decision_status = approved`.
- Schedule authority is loaded only from `schedules.status = published`, `schedules.active_version_id`, `schedule_versions.status = published` and same tenant/branch `schedule_events`.
- Substitute teacher branch and active status are loaded from `teachers` and `teacher_branches`.
- Course eligibility must come from #166 `teacher_courses`; Schedule history inference is forbidden.

## Endpoints

| Method | Path | Permission | Behavior |
|---|---|---|---|
| GET | `/api/v1/daily-operations/leaves/:leaveId/impact` | `leave:impact:read` | Returns impacted published lessons for an approved leave. |
| GET | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/candidates` | `leave:impact:read` | Returns decision-support candidates only. No assignment is created. |
| POST | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` | `daily_operations:update` | Creates a human substitute assignment with `If-Match`. |
| DELETE | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` | `daily_operations:update` | Clears a human substitute assignment with `If-Match`. |
| POST | `/api/v1/daily-operations/leaves/:leaveId/projection/replay` | `daily_operations:update` | Replays idempotent projection/upsert. |

## Optimistic Concurrency

Mutation endpoints require:

```http
If-Match: "leave:<leaveId>:v<version>"
```

- missing/invalid version: `428`
- stale version: `412`

## Coverage State

Coverage is separate from Leave decision:

```text
not_required | unresolved | partially_covered | covered
```

Rules:

- no impacted lessons => `not_required`
- no resolved impacted lessons => `unresolved`
- some resolved impacted lessons => `partially_covered`
- all impacted lessons resolved => `covered`

A leave may remain approved while coverage is `unresolved`.

## Candidate Filtering

A substitute candidate must pass all filters:

1. same tenant
2. same branch through active `teacher_branches`
3. active teacher
4. no approved leave overlap for the candidate
5. no published schedule time conflict for the candidate
6. `teacher_courses` authority confirms the candidate can teach the course

Candidate lists are decision support only. They do not create approval or assignment side effects.

## Projection Idempotency

Projection key:

```text
leave:<leaveRequestId>:version:<scheduleVersionId>:event:<scheduleEventId>
```

`daily_operation_lessons.projection_key` is unique. Replays use upsert and must not create duplicates.

Assignment clear changes the lesson back to `open` and recomputes coverage.

## KVKK / Audit / Outbox

Allowed payload fields are opaque IDs, state, version and reason-code style metadata.

Forbidden payload content:

- student PII
- parent/guardian PII
- teacher name/e-mail/phone
- free-text leave detail
- health detail
- raw DTO
- raw entity
- request body
- response body
- tokens/cookies/credentials

Audit events:

```text
leave.substitution_assigned.v1
leave.substitution_cleared.v1
daily_operations.projected.v1
```

Outbox events use `leave_outbox_events` with idempotent `event_key`.

## #166 HOLD

Until #166 PASS, `teacher_courses` is not final authority. Candidate endpoint may return an empty non-finalized response and assignment creation fails closed with `TEACHER_COURSE_ELIGIBILITY_NOT_READY`.
