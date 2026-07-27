# Production Frontend Preflight: Route → API → Permission Matrix

Issue: #145  
Gate: runtime binding starts only after #144 stable API/contract outputs.  
Status: preflight artefact, no runtime code.

## Matrix rules

- Endpoint paths are contract-facing placeholders for runtime planning; this PR does not register API clients or handlers.
- Permission names are capability-level dependencies, not hard-coded frontend keys.
- The server is authoritative for tenant, branch, teacher, course and leave scope.
- UI state must be driven by canonical API response and reason code, not by client-inferred existence.
- All denied cross-scope states must be non-enumerating.

## P0 route matrix

| Route | Persona | Primary API dependency after #144 | Permission dependency | Primary UI states | Non-enumerating rule |
| --- | --- | --- | --- | --- | --- |
| `/app/today` | Teacher | `GET /api/v1/daily-operations/today` | read own daily operations | loading, empty_same_scope, ready, forbidden_non_enumerating, offline_or_unavailable | Do not reveal other teacher or branch queues. |
| `/app/today` | Operations Manager | `GET /api/v1/daily-operations/today` | read branch daily operations | loading, empty_same_scope, ready, conflict_blocking, offline_or_unavailable | Same-tenant/branch only. |
| `/app/leave` | Teacher | `GET /api/v1/leaves?scope=own`; `POST /api/v1/leaves` | read own leave, create own leave | loading, empty_same_scope, form_ready, validation_error, stale_version, offline_or_unavailable | Own requests only. |
| `/app/leave` | Operations Manager | `GET /api/v1/leaves?scope=branch` | read branch leave queue | loading, empty_same_scope, ready, forbidden_non_enumerating, offline_or_unavailable | No cross-branch enumeration. |
| `/app/leave/:id` | Teacher | `GET /api/v1/leaves/:id` | read own leave detail | loading, ready, forbidden_non_enumerating, stale_version, offline_or_unavailable | If not own or denied, show generic denial. |
| `/app/leave/:id` | Operations Manager | `GET /api/v1/leaves/:id`; `GET /api/v1/leaves/:id/impact`; `GET /api/v1/leaves/:id/candidates` | read leave detail, read lesson impact, read coverage candidates | loading, ready, conflict_blocking, empty_same_scope, forbidden_non_enumerating | Candidate absence vs denial must be distinct only in same-scope responses. |
| `/app/leave/:id/decision` | Operations Manager | `POST /api/v1/leaves/:id/decision` | approve or reject leave | submitting, success, validation_error, stale_version, forbidden_non_enumerating, conflict_blocking | Never show whether a denied cross-scope leave exists. |
| `/app/leave/:id/assignments` | Operations Manager | `POST /api/v1/leaves/:id/assignments`; `DELETE /api/v1/leaves/:id/assignments/:assignmentId` | create or clear coverage assignment | submitting, success, stale_version, conflict_blocking, forbidden_non_enumerating | No client-only assignment success. |
| `/app/attendance/session/:sessionId` | Teacher | `GET /api/v1/attendance/sessions/:sessionId`; `PATCH /api/v1/attendance/sessions/:sessionId` | read/update own attendance session | loading, ready, forbidden_non_enumerating, stale_version, validation_error, offline_or_unavailable | If not own assignment, generic denied state. |
| `/app/attendance/session/:sessionId` | Operations Manager | `GET /api/v1/attendance/sessions/:sessionId` | read branch attendance session | loading, ready, empty_same_scope, forbidden_non_enumerating | Branch scope remains server-authoritative. |

## Action matrix

| User action | Required server capability | Client behavior before response | Success behavior | Failure behavior |
| --- | --- | --- | --- | --- |
| Teacher creates leave request | create own leave | Disable submit, show submitting | Replace local view with server response | Keep form data in memory only; show canonical reason. |
| Teacher opens own leave | read own leave | Loading state | Render server projection | forbidden_non_enumerating for denied/not visible. |
| Operations Manager approves leave | decide branch leave | Disable decision buttons | Refetch leave impact and daily queue | stale/conflict/forbidden reason-code state. |
| Operations Manager assigns coverage | create coverage assignment | Disable assignment control | Refetch assignments and open lesson queue | stale/conflict/forbidden reason-code state. |
| Operations Manager clears coverage | clear coverage assignment | Disable clear control | Refetch assignments and open lesson queue | stale/conflict/forbidden reason-code state. |
| Teacher updates attendance | update own attendance session | Disable row/action | Refetch session summary | stale/forbidden/validation reason-code state. |

## Permission dependency taxonomy

Capability-level dependencies to map after #144:

- `daily_operations.read_own`
- `daily_operations.read_branch`
- `leave.read_own`
- `leave.create_own`
- `leave.read_branch`
- `leave.decide_branch`
- `leave.read_impact_branch`
- `leave.read_candidates_branch`
- `leave.assignment_create_branch`
- `leave.assignment_clear_branch`
- `attendance.read_own_session`
- `attendance.update_own_session`
- `attendance.read_branch_session`

These are planning labels. They are not runtime permission keys and must not be hard-coded into production UI before the Permission Catalog contract is stable.

## Data projection constraints

| Data area | Allowed frontend projection | Blocked projection |
| --- | --- | --- |
| Teacher | Display name, subject summary, availability returned by API | Raw personal identifiers, cross-tenant teacher existence. |
| StudentGroup | Group code/name returned by API | Individual student roster unless future approved scope. |
| Parent/Guardian | None in this preflight | Phone, email, message body, notification payload. |
| Leave | Status, date range, impact summary | Sensitive reason details beyond approved contract. |
| Assignments | Coverage teacher display, lesson slot, status | Client-inferred candidate ranking or solver output. |

## Acceptance coverage

- Route/API/permission matrix ready: yes.
- Runtime API binding added: no.
- Permission key hard-code added: no.
- Fake API/localStorage authority added: no.
