# WP-07F Runtime Frontend Planning: Synthetic E2E Fixture and Accessibility Update

Issue: #145  
Backend baseline: #175 merged  
Runtime status: not implemented

## Fixture authority

Synthetic E2E data must be created by the test backend/database seed path, not by browser state.

Forbidden sources:

- `localStorage`
- `sessionStorage`
- cookies as role/tenant authority outside auth contract
- demo fixtures
- Builder/Vercel presentation payloads
- Full Vision artefacts
- production-like PII
- client-generated teacher/course/candidate eligibility

## Required fixture groups

| Fixture group | Purpose | Required properties | PII stance |
| --- | --- | --- | --- |
| Teacher own leave | Teacher creates and reads own leave. | Own teacher identity, own branch, safe leave date range. | No real teacher personal fields beyond controlled display. |
| Cross-teacher leave | Teacher attempts non-owned leave URL. | Same tenant or hidden scope as test requires. | Must return non-enumerating UI. |
| Operations branch queue | Operations Manager opens leave queue. | Same-branch pending/approved leave records. | Opaque IDs and controlled labels only. |
| Published schedule impact | Impact read path. | Active published schedule and occurrence intersections. | Student/parent data absent. |
| Pre-#166 candidate seam | Fail-closed candidate/assignment path. | Candidate finalization unavailable. | No local candidate inference. |
| Post-#166 eligible candidate | Assignment create success path after #166. | `teacher_courses` source proves eligibility. | Opaque teacher/course IDs only. |
| Conflict candidate | Conflict blocking path. | Substitute time conflict or leave overlap. | Server projection only. |
| Version mismatch | Stale mutation path. | Old `If-Match` version. | No auto retry. |
| Daily Operations queue | Projection verification. | open → covered/resolved → open transitions. | No student/parent payload. |

## Pre-#166 E2E assertions

Before #166 PASS, the runtime PR must not present assignment create as complete. If any limited UI is implemented before #166, browser tests must assert:

| ID | Scenario | Required outcome |
| --- | --- | --- |
| PRE166-01 | Operations Manager opens impact. | Impact renders only if server route is stable. |
| PRE166-02 | Operations Manager opens candidate list with non-finalized eligibility. | UI shows `eligibility_not_ready` or read-only support; create disabled. |
| PRE166-03 | User attempts assignment create if control is visible. | Backend reason `TEACHER_COURSE_ELIGIBILITY_NOT_READY` maps to blocked state. |
| PRE166-04 | UI must not add local assignment row. | No coverage change until server confirms. |
| PRE166-05 | Daily Operations queue remains server-driven. | No client-projected open/resolved state. |

## Post-#166 P0 E2E path

After #166 PASS and #144 reconciliation, required E2E route path:

1. Teacher logs in and creates own leave with server-authored session.
2. Operations Manager opens same-branch leave queue.
3. Operations Manager opens leave detail and server impact rows.
4. Operations Manager opens candidate list for one affected event.
5. Test selects server-finalized eligible substitute.
6. Assignment create sends exact `If-Match`.
7. UI refetches impact and Daily Operations queue.
8. Coverage/open lesson state reflects server response.
9. Assignment clear sends exact `If-Match`.
10. UI refetches impact and queue again; affected current lesson returns to `open`.
11. Stale version mutation returns `LEAVE_VERSION_MISMATCH`; submit remains blocked until refresh.
12. Cross-tenant/cross-branch URL attempts show `forbidden_non_enumerating` without record hints.

## Error, empty, stale and conflict checklist

| State | Required check |
| --- | --- |
| loading | No fake rows while server response is pending. |
| empty_same_scope | Only after API confirms same-scope empty queue. |
| forbidden_non_enumerating | Generic denial copy; no tenant/branch/owner hint. |
| eligibility_not_ready | Assignment create disabled or blocked; no local fallback. |
| stale_version | Mutation disabled until explicit refresh; no automatic retry. |
| conflict_blocking | Conflict panel remains visible; no success state. |
| offline_or_unavailable | Mutation disabled; no local authority cache. |
| error_retryable | Read retry only; no mutation retry by default. |

## Accessibility and keyboard update

Runtime implementation gate must include:

| Area | Required behavior |
| --- | --- |
| Route shell | Keyboard path to main content; current page announced by heading. |
| Leave form | Labels, descriptions and error messages programmatically associated. |
| Impact table | Row headers and accessible status text for coverage/open state. |
| Candidate list | Keyboard-selectable candidate controls; disabled state announced. |
| Assignment modal | Focus trap, Escape behavior, return focus to opener. |
| Stale panel | Focusable refresh action and screen-reader visible version message. |
| Conflict panel | Color-independent text and icon/status label. |
| Non-enumerating forbidden | Copy is concise and does not reveal hidden record. |
| Toast/alert | Live region with non-blocking announcements. |
| Responsive | 360, 430, 768, 820, 1024 and 1440 px smoke coverage. |

## Runtime evidence required later

- Exact-head browser E2E run IDs.
- Accessibility automation and manual keyboard checklist.
- Sensitive Pattern Scanner and GitGuardian PASS.
- Boundary test PASS for demo/Builder/Full Vision imports.
- KVKK note confirming no production-like PII fixtures.
- Independent approval on current runtime head.

## Acceptance coverage

- Synthetic E2E fixture design updated: yes.
- #166-before fail-closed path covered: yes.
- #166-after assignment create/clear path covered: yes.
- Accessibility checklist updated: yes.
- Runtime implementation added: no.
