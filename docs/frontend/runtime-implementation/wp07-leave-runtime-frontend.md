# WP-07F Runtime Frontend Implementation Evidence

Issue: #145  
Branch: `wp07/leave-runtime-frontend`  
Scope: Faz 1 Leave Management + Daily Operations runtime binding

## Runtime boundary

The runtime frontend is isolated under `frontend/runtime/` and does not import demo, Builder or Full Vision artefacts. It consumes only real API routes under `/api/v1` and keeps authority on the backend side.

Authority rules:

- access token is kept in memory only;
- tenant is passed only through the login body supported by `/api/v1/auth/login`;
- branch is a query parameter for queue/today and remains server-validated;
- role and permission are not client-controlled;
- assignment mutation uses the exact server-returned `leaveEtag`;
- coverage, open lesson and candidate eligibility are never computed in the browser.

## Production build and serve path

Production build now includes the runtime static assets without adding a separate frontend hosting surface:

- `npm run build` runs `tsc -p tsconfig.json && npm run build:runtime`.
- `npm run build:runtime` runs `node scripts/build-runtime-assets.js`.
- `scripts/build-runtime-assets.js` copies `frontend/runtime/` into `dist/runtime/`.
- Nest serves `dist/runtime/` under `/runtime` through `app.useStaticAssets(..., { prefix: '/runtime' })`.
- `API_ROOT` remains same-origin `/api/v1`; no CORS-based split hosting is introduced.

## Implemented P0 flows

### Teacher

- Login with email/password and optional tenant ID.
- Create own leave through `POST /api/v1/leaves/me` using only `CreateLeaveRequestDto` fields: `branchId`, `durationType`, `reasonCode`, `startsAt`, `endsAt`.
- Read own active leave through `GET /api/v1/leaves/me/:id` after server returns a leave ID.
- Render loading, validation/error, forbidden and stale-compatible states through canonical reason-code mapping.

### Operations Manager

- Read Daily Operations queue through `GET /api/v1/daily-operations/today?branchId=<uuid>&date=YYYY-MM-DD` and use backend `leaveRequestId` for impact navigation.
- Open server-authored leave impact through `GET /api/v1/daily-operations/leaves/:leaveId/impact` and consume `LeaveImpactResponse.events`.
- Read candidates through `GET /api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/candidates`.
- Create assignment through `POST /api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` with exact `If-Match`.
- Clear assignment through `DELETE /api/v1/daily-operations/leaves/:leaveId/events/:scheduleEventId/substitution` with exact `If-Match`.
- Derive assignment state from `events[].substituteAssignmentId`.
- Refetch impact and queue after create/clear so coverage/open lesson state remains server-confirmed.

## Reason-code handling

The runtime maps canonical backend reason codes to explicit UI states:

- `FORBIDDEN`, `RESOURCE_NOT_VISIBLE`, `BRANCH_NOT_VISIBLE` -> non-enumerating forbidden state.
- `LEAVE_VERSION_REQUIRED` -> mutation blocked until fresh version exists.
- `LEAVE_VERSION_MISMATCH` -> stale version state with explicit refresh requirement.
- `IMPACT_ANALYSIS_NOT_READY` -> downstream decision and assignment blocked.
- `TEACHER_COURSE_ELIGIBILITY_NOT_READY` -> assignment create disabled; `eligibilityFinalized: false` is blocking, not empty.
- `SUBSTITUTE_LEAVE_OVERLAP`, `SUBSTITUTE_TIME_CONFLICT` -> conflict blocking state.
- `ASSIGNMENT_ALREADY_EXISTS` -> duplicate create disabled.
- `ASSIGNMENT_NOT_FOUND` -> same-scope empty/not-found state and impact refetch.

Nest error envelopes are normalized so generic 403/409/412 responses still resolve to canonical frontend states.

## Accessibility and responsive checks

The runtime includes:

- one visible page `h1`;
- skip-to-content link;
- labelled forms;
- keyboard-reachable tab buttons;
- focus target on route panel switch;
- live region for notices;
- `role="status"` loading feedback;
- region labels for queue, impact and candidate panels;
- color-independent state borders for stale/conflict/forbidden;
- responsive collapse below 820px.

## Test evidence target

Jest tests added:

- `test/frontend-runtime/runtime-boundary.spec.ts`
- `test/frontend-runtime/runtime-flow-a11y.spec.ts`

The tests assert:

- real API paths are present;
- runtime assets are copied into `dist/runtime` during production build;
- Nest serves the runtime under `/runtime`;
- `API_ROOT` remains same-origin `/api/v1`;
- no demo/Builder/Full Vision imports exist;
- no persistent browser storage authority exists;
- no fake API/local success adapter exists;
- assignment create/clear uses server-returned ETag;
- DTO, queue, impact events, assignment state and eligibility-finalization contracts are represented;
- canonical reason-code mapping exists;
- keyboard/focus/responsive and loading/empty/error states are present.

## KVKK and security notes

No production-like PII fixture is introduced. The UI renders only backend response fields and does not introduce parent, guardian, phone, email, health detail or free-text leave reason projection beyond user-entered create form content.

Audit payloads, backend schemas, migrations, notification delivery and permission catalogs are not changed in this PR.
