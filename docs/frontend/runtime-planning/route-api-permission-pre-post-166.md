# WP-07F Runtime Frontend Planning: Route → API → Permission Pre/Post-#166 Matrix

Issue: #145  
Backend baseline: #175 merged  
External prerequisite: #166 TeacherCourse Eligibility Foundation  
Implementation status: none

## Rules

- This is a planning matrix only. It does not register route handlers, API clients or components.
- Browser-supplied tenant, branch, teacher, course, room or schedule identifiers are not authority.
- Permission labels are capability dependencies, not frontend hard-coded keys.
- Every mutation must be driven by backend response and exact resource version.
- Forbidden, not-visible and cross-scope outcomes must remain non-enumerating.

## P0 route matrix after #175

| Route | Persona | API dependency | Permission/capability dependency | UI states | Authority rule |
| --- | --- | --- | --- | --- | --- |
| `/app/today` | Teacher | `GET /api/v1/daily-operations/today` or #144 reconciled own summary | read own daily operations | loading, empty_same_scope, ready, forbidden_non_enumerating, offline_or_unavailable | Server-authored own scope only. |
| `/app/today` | Operations Manager | `GET /api/v1/daily-operations/today` | read branch daily operations | loading, empty_same_scope, ready, conflict_blocking, offline_or_unavailable | Branch context from server only. |
| `/app/leave` | Teacher | `POST /api/v1/leaves/me`; own list/detail route from #144 reconciliation | create own leave, read own leave | loading, form_ready, validation_error, leave_version_mismatch, offline_or_unavailable | No operations-only queue binding. |
| `/app/leave` | Operations Manager | `GET /api/v1/leaves?branchId=<server-context-branchId>` | read branch leave queue | loading, empty_same_scope, ready, forbidden_non_enumerating, offline_or_unavailable | `branchId` must be server-authored and server-validated. |
| `/app/leave/:id` | Teacher | `GET /api/v1/leaves/:id` | read own leave detail | loading, ready, forbidden_non_enumerating, leave_version_mismatch, offline_or_unavailable | Denied/not-owned records do not reveal existence. |
| `/app/leave/:id` | Operations Manager | `GET /api/v1/leaves/:id`; `GET /api/v1/daily-operations/leaves/:id/impact` | read leave detail, read impact | loading, ready, impact_analysis_not_ready, forbidden_non_enumerating, offline_or_unavailable | Impact response is server projection. |
| `/app/leave/:id/candidates` | Operations Manager | `GET /api/v1/daily-operations/leaves/:id/events/:scheduleEventId/candidates` | read coverage candidates | loading, ready, eligibility_not_ready, empty_same_scope, forbidden_non_enumerating | Candidate list is decision support only. |
| `/app/leave/:id/assignments` | Operations Manager | `POST /api/v1/daily-operations/leaves/:id/events/:scheduleEventId/substitution`; `DELETE /api/v1/daily-operations/leaves/:id/events/:scheduleEventId/substitution` | create/clear substitution assignment | submitting, success, leave_version_mismatch, eligibility_not_ready, conflict_blocking, forbidden_non_enumerating | Mutation requires exact `If-Match`. |

## #166-before behavior: fail-closed assignment planning

Until #166 is complete, assignment create must not become a success state.

| User action | Expected backend outcome before #166 | Required frontend state | Forbidden behavior |
| --- | --- | --- | --- |
| Open impact | Read impact if #144 reconciled route is stable. | ready or impact_analysis_not_ready. | Fake impact rows. |
| Open candidate list | Candidate response may be non-finalized. | eligibility_not_ready or read-only decision support. | Client finalization, schedule-history inference. |
| Create assignment | Backend fail-closed: `TEACHER_COURSE_ELIGIBILITY_NOT_READY`. | `eligibility_not_ready`; keep create disabled or show blocked panel after response. | Local success, optimistic coverage, fake assignment row. |
| Clear assignment | If no confirmed assignment exists, do not fabricate clear path. | same-scope not-found or blocked until reconciled. | Local removal that changes coverage. |
| Refetch Daily Operations queue | Read-only verification only. | ready/empty/error based on server. | Client-calculated queue state. |

## #166-after behavior: assignment create/clear P0 E2E path

After #166 PASS and #144 acceptance reconciliation, bounded runtime PR may implement the following P0 path:

| Step | API | Required evidence |
| --- | --- | --- |
| 1 | Load leave detail and impact. | Impact rows are server-returned and same-scope. |
| 2 | Load candidates for one affected event. | Candidate is finalized by `teacher_courses` authority, not Schedule history. |
| 3 | Create assignment with `If-Match: "leave:<id>:v<version>"`. | Response creates assignment; no local-only success. |
| 4 | Refetch impact. | Coverage moves according to server response. |
| 5 | Refetch Daily Operations queue. | Covered/open lesson state reflects server projection. |
| 6 | Clear assignment with exact `If-Match`. | Affected current lesson returns to `open`. |
| 7 | Refetch impact and queue again. | Coverage/open state is server-confirmed. |

## Reason-code handling required by route plan

| Backend reason code | UI state | Mutation control |
| --- | --- | --- |
| `TEACHER_COURSE_ELIGIBILITY_NOT_READY` | eligibility_not_ready | Disable assignment create; no fallback. |
| `LEAVE_VERSION_REQUIRED` | version_required | Block mutation until fresh version exists. |
| `LEAVE_VERSION_MISMATCH` | stale_version | Disable mutation until explicit refresh; no auto retry. |
| `SCHEDULE_HARD_CONFLICTS_PRESENT` | conflict_blocking | Keep blocking panel visible. |
| `SUBSTITUTE_TIME_CONFLICT` | conflict_blocking | Keep assignment modal open with server projection only. |
| `ASSIGNMENT_NOT_FOUND` | empty_or_not_found_same_scope | Refetch impact; no cross-scope hint. |
| `FORBIDDEN` / `RESOURCE_NOT_VISIBLE` | forbidden_non_enumerating | Hide target details and action result. |

## Runtime acceptance boundary

- #166-before path may only prove fail-closed behavior.
- #166-after path may prove assignment create/clear E2E.
- Runtime PR must not import demo, Builder or Full Vision artefacts.
- Runtime PR must not introduce fake API or localStorage/sessionStorage authority.
- Runtime PR must remain bounded to #145 Faz 1 leave/daily operations flow.
