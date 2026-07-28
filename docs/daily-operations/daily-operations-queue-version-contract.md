# WP-07E Daily Operations Queue and Version Contract

```text
STATUS: BACKEND/API CONTRACT
ISSUE: #179
FRONTEND RUNTIME: OUT OF SCOPE
```

## Scope

This contract adds the canonical Daily Operations queue/today read surface and makes the
assignment create/clear version retrieval path explicit.

Out of scope: frontend runtime, fake API, demo fixture, client-side version guessing,
#144 closure and #145 runtime GO.

## Queue / today endpoint

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/daily-operations/today?branchId=<uuid>&date=YYYY-MM-DD` | `daily_operations:read` |

Rules:

- Tenant authority comes only from authenticated `RequestContext.tenantId`.
- `branchId` is accepted only as a filter and is validated server-side against the
  current tenant.
- A cross-tenant or non-visible branch returns non-enumerating not found behavior.
- Empty same-scope queues return `lessons: []`.
- Response DTO is allowlisted and PII-free.

## Queue response allowlist

Top-level fields:

```text
tenantScoped
branchId
date
permission
lessons
```

Lesson fields:

```text
dailyOperationLessonId
leaveRequestId
leaveVersion
leaveEtag
branchId
scheduleVersionId
scheduleEventId
occurrenceDate
startsAt
endsAt
state
coverageStatus
originalTeacherId
substituteAssignmentId
substituteTeacherId
studentGroupId
courseId
roomId
timeSlotId
```

Forbidden fields:

```text
teacher name/e-mail/phone
student name
parent/guardian data
free-text leave detail
health detail
raw request/response body
token/cookie/credential
```

## Assignment create / clear version contract

Assignment create and clear keep the existing mutation paths:

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` | `daily_operations:update` |
| DELETE | `/api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` | `daily_operations:update` |

Mutation header:

```http
If-Match: "leave:<leaveId>:v<version>"
```

Rules:

- Missing or invalid `If-Match` returns `428`.
- Syntactically valid but stale `If-Match` returns `412`.
- Assignment create response includes `leaveVersion` and `leaveEtag`.
- Assignment clear must use the exact current `leaveEtag` returned by the latest
  server read or mutation response.
- The client must not advance, guess, cache-authorize or synthesize the version.

## Non-enumerating behavior

| Case | Behavior |
|---|---|
| Cross-tenant branch | Non-enumerating not found |
| Non-visible branch | Non-enumerating not found |
| Cross-tenant leave | Non-enumerating leave impact not found |
| Unauthorized permission | Permission guard denies access without record details |

## Evidence requirements

- Contract tests must pin route, permission, DTO allowlist and ETag syntax.
- Backend CI, DB Smoke, Gate 1, Sprint 1 Quality Gate, Sensitive Pattern Scanner
  and GitGuardian must pass on exact PR head before Ready/Merge.
- Architecture + QA/Security/KVKK review must approve the current head.
