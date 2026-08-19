# WP-07F Runtime Frontend Planning: Runtime PR Boundary Plan

Issue: #145  
Planning branch: `wp07/leave-runtime-frontend-planning`  
Future runtime branch: `wp07/leave-runtime-frontend` only after #166 PASS and #144 acceptance reconciliation

## Decision boundary

Runtime implementation remains on HOLD. The next bounded runtime PR may start only when all of the following are true:

1. #166 TeacherCourse Eligibility Foundation is PASS and merged or otherwise formally accepted.
2. #144 acceptance reconciliation confirms stable API route, DTO, reason-code and version behavior.
3. #174 preflight artefacts plus this post-#175 planning delta are accepted.
4. The runtime branch starts from fresh `main` after the above merges.
5. The PR scope remains Faz 1 Leave + Daily Operations frontend only.

## Target runtime PR scope

Allowed after gates:

- Production frontend workspace/runtime shell needed for #145 only.
- Auth/session bootstrap consumption from real backend contract.
- Server-authored tenant/branch context consumption.
- Teacher own leave create/read flow.
- Operations Manager leave queue, leave detail, impact, candidates, assignment create/clear and Daily Operations queue flow.
- Canonical reason-code UI states.
- P0 browser E2E and accessibility test coverage.
- Boundary scanner for demo/Builder/Full Vision imports.

Not allowed:

- Fake API client.
- Demo fixture import.
- localStorage/sessionStorage authority.
- Builder/Vercel presentation code.
- Full Vision import.
- New dashboard.
- Design-system rewrite.
- Faz 2/3 routes.
- Production-like PII fixture.
- Solver or automatic substitute assignment.

## File and component boundary

Target runtime PR should keep a bounded file set:

| Area | Allowed files | Boundary |
| --- | --- | --- |
| Runtime app shell | Production frontend entrypoint/config only if absent. | No demo app reuse. |
| API contract layer | Thin typed client or generated contract adapter. | No fake API adapter or local success simulation. |
| Leave pages | Teacher and Operations Manager P0 pages only. | No dashboard expansion. |
| Daily Operations queue | Queue read/refetch surface needed by assignment path. | No unrelated analytics. |
| Reason-code UI | Shared state/copy mapping. | No raw permission/tenant IDs in copy. |
| Tests | P0 E2E, a11y, boundary tests. | Tests use server-side synthetic fixtures only. |

Preferred PR size target:

```text
HAND-WRITTEN LOC: bounded and reviewable
FILES: enough for runtime vertical slice; avoid unrelated refactor
MIGRATION: none in frontend PR
```

## Component/API boundary

Runtime components must not decide authority. They may only render server-owned state.

| Component responsibility | Must do | Must not do |
| --- | --- | --- |
| Leave queue | Render API rows and empty state. | Invent branch filter from client. |
| Leave detail | Render server projection. | Reveal cross-scope owner or branch. |
| Impact panel | Render server impact rows. | Compute impact from local Schedule data. |
| Candidate panel | Render server candidates and reason states. | Rank or finalize candidates locally. |
| Assignment controls | Submit exact API mutation with `If-Match`. | Create optimistic assignment success. |
| Daily queue panel | Refetch and render server queue. | Locally project open/resolved authority. |
| Error state | Map backend reason code. | Replace blocked state with generic success. |

## Fake API and local authority risk controls

Runtime PR must include static and E2E checks for:

- no import path containing `demo-frontend`;
- no string `OKUL-DEMO-2026-07-21-v1`;
- no Builder.io/full-vision imports;
- no fake API adapter in production source;
- no localStorage/sessionStorage use for tenant, branch, role, permission, teacher, course, candidate, assignment or version authority;
- no browser-generated `If-Match` version not sourced from server response;
- no client-generated coverage state;
- no production-like PII fixture in test data or screenshots.

## Ready/merge rule

A future runtime PR must remain Draft until it has exact-head evidence for:

- P0 browser E2E PASS.
- Accessibility checklist PASS.
- Boundary test PASS.
- Sensitive Pattern Scanner PASS.
- GitGuardian PASS.
- KVKK note confirming no production-like PII fixtures.
- Independent current-head approval.
- Zero unresolved review threads.

## Acceptance coverage

- Runtime PR boundary plan ready: yes.
- Runtime implementation performed: no.
- #145 runtime GO condition left open: yes.
- Fake API/localStorage authority still forbidden: yes.
