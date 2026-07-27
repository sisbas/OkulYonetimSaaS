# Production Frontend Preflight: P0 E2E, Accessibility and Boundary Test Plan

Issue: #145  
Gate: execute after #144 stable API/contract outputs and runtime implementation PR.  
Current PR status: planning artefact only.

## What this preflight does not test

This PR does not add runtime frontend implementation. Therefore it does not run browser E2E, component tests, API contract tests or accessibility automation. It defines the tests required for the later runtime implementation gate.

## P0 browser E2E plan

### Environment prerequisites

- Real backend API available under `/api/v1`.
- Test identities for Teacher and Operations Manager with server-side RBAC.
- Server-authored tenant and branch context.
- Seeded non-PII operational records or synthetic server-side test data approved for CI.
- No demo frontend, fake API, localStorage authority or Builder artefact import.

### Teacher journey

| ID | Scenario | Expected evidence |
| --- | --- | --- |
| E2E-T-01 | Teacher logs in and lands on `/app/today`. | Session bootstrap succeeds; own operational summary appears. |
| E2E-T-02 | Teacher sees own schedule/attendance items only. | No other teacher items visible. |
| E2E-T-03 | Teacher creates leave request. | POST succeeds; UI renders server response only. |
| E2E-T-04 | Teacher opens own leave detail. | Status, date and approved projection visible. |
| E2E-T-05 | Teacher attempts another teacher's leave URL. | `forbidden_non_enumerating`; no existence leak. |
| E2E-T-06 | Teacher opens own attendance session and updates state. | PATCH succeeds; refreshed session summary visible. |
| E2E-T-07 | Teacher opens non-owned attendance session. | Generic forbidden/non-enumerating state. |

### Operations Manager journey

| ID | Scenario | Expected evidence |
| --- | --- | --- |
| E2E-O-01 | Operations Manager opens `/app/today`. | Same-branch operations queue appears. |
| E2E-O-02 | Operations Manager opens leave queue. | Pending same-scope leave requests visible or same-scope empty state. |
| E2E-O-03 | Opens leave detail and impact. | Server-returned lesson impact visible. |
| E2E-O-04 | Reads candidate coverage list. | Server-returned candidates only; no client solver. |
| E2E-O-05 | Approves leave with unresolved coverage conflict. | `conflict_blocking`; no fake success. |
| E2E-O-06 | Creates assignment. | Server response updates impact and open lesson queue. |
| E2E-O-07 | Clears assignment. | Server response updates impact and open lesson queue. |
| E2E-O-08 | Stale assignment mutation. | `stale_version`; no automatic mutation retry. |
| E2E-O-09 | Cross-branch leave URL. | `forbidden_non_enumerating`; no branch existence leak. |

### Shared reason-code assertions

- `AUTH_REQUIRED` redirects or blocks protected route without target object details.
- `FORBIDDEN` and `RESOURCE_NOT_VISIBLE` use generic non-enumerating copy.
- `RESOURCE_NOT_FOUND_SAME_SCOPE` appears only for API-confirmed same-scope lookup.
- `HARD_CONFLICT_PRESENT` blocks decision/assignment success.
- `STALE_VERSION` disables mutation until refresh.
- `OFFLINE_OR_UNAVAILABLE` disables mutation and never uses local authority fallback.

## Keyboard and focus checklist

| Area | Requirement |
| --- | --- |
| App shell | Skip link or equivalent keyboard path to main content. |
| Navigation | All routes reachable with keyboard. Current route announced visually and semantically. |
| Forms | Labels are programmatically associated with inputs. |
| Error summary | Validation errors can receive focus and reference fields. |
| Modals | Focus trapped, Escape closes when safe, return focus to opener. |
| Tables/grids | Keyboard navigation does not require pointer-only interaction. |
| Disabled actions | Disabled state is visible and programmatically expressed. |
| Toasts/alerts | Non-blocking alerts use appropriate live region. |
| Stale/conflict panels | Focusable action to refresh or inspect conflict. |

## Responsive checklist

| Viewport | Required behavior |
| --- | --- |
| 360–430px mobile | Primary navigation usable, no global horizontal overflow, tables degrade safely. |
| 768–820px tablet portrait | Sidebar/mobile breakpoint verified; operations tables and schedule grids remain usable. |
| 1024px tablet/desktop | Split panels usable without hidden controls. |
| 1440px desktop | Full operations workflow visible without layout gaps. |

## Accessibility acceptance frame

Runtime implementation gate should require:

- WCAG 2.2 AA-oriented manual review for P0 flows.
- Automated accessibility scan on P0 routes.
- Keyboard-only completion of Teacher leave creation.
- Keyboard-only completion of Operations Manager assignment decision path.
- Focus restoration after modal close.
- Meaningful headings and landmarks.
- Color-independent conflict/stale/error state communication.
- Reduced motion or no essential animation dependency.
- Turkish error copy that is clear and non-enumerating.

## Demo/Builder/Full-Vision boundary test plan

The runtime implementation PR must include a boundary test that fails if production frontend code imports or references:

- `demo-frontend/`
- `Builder.io`
- `builder.io`
- `full-vision`
- `fullVision`
- `presentation prototype`
- `OKUL-DEMO-2026-07-21-v1`
- deterministic demo fixture names from the demo app
- Vercel presentation-only route fallback as production route source

### Boundary test acceptance

- Production frontend source tree scan passes.
- Build output does not contain demo seed strings.
- No production route imports demo state or fixtures.
- No runtime tests depend on browser localStorage as permission/session authority.

## Fake API and localStorage authority risk list

| Risk | Failure mode | Required control |
| --- | --- | --- |
| Fake API adapter sneaks into runtime | UI shows success without backend persistence. | Static import scan and E2E server verification. |
| localStorage used as tenant authority | User can switch tenant/branch client-side. | Scope only from server session/context endpoint. |
| localStorage used as role authority | User can unlock buttons/client routes. | Capability projection only from server; backend still enforces. |
| Demo fixture imported | Sales data becomes pseudo-production truth. | Boundary test blocks demo imports and seed strings. |
| Client-generated candidate list | Coverage candidates bypass server rules. | Candidate list only from API response. |
| Silent stale retry | Overwrites newer decision/assignment. | Stale state disables mutation until explicit refresh. |
| Cross-tenant 404 copy | Confirms record exists elsewhere. | Non-enumerating forbidden/not-visible copy. |
| Production-like PII fixture | KVKK exposure in tests/screenshots. | Non-PII server test seed; masked screenshots only. |

## Evidence required after implementation

The later runtime PR must provide:

- P0 browser E2E run IDs.
- Accessibility scan result and manual keyboard checklist.
- Boundary test result.
- Sensitive pattern scanner result.
- KVKK note confirming no production-like PII fixtures.
- Exact head SHA evidence.
- Independent approval on current head.

## Acceptance coverage

- P0 E2E test plan ready: yes.
- Accessibility checklist ready: yes.
- Demo boundary test plan ready: yes.
- Fake API/localStorage authority risk list ready: yes.
- Runtime implementation added: no.
