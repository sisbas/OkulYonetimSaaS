# Phase 1 Capability Truth Matrix

**Published:** 2026-08-29
**Main HEAD:** a11036d97dc44272b93f1baf46a437b0d8092a46
**Owner:** CTO (HCO loop)
**Purpose:** Reconcile Phase 1 claims with executable evidence. Classification is
binding; a closed tracker with unchecked/HOLD criteria is NOT reported complete.

## Classification legend
- `planning-only` — design/issue only, no runtime code or unproven
- `internal` — code exists but not pilot-verified / tests missing / blocked
- `runtime` — code + tests pass on main, operable in production path
- `pilot-ready` — runtime + genuine fresh-DB UI journey + pilot observation (#269)

## Capability matrix

| Capability | Issue/PR lineage | Classification | Evidence (main HEAD a11036d) | Owner | Severity | Missing / Block |
|---|---|---|---|---|---|---|
| Schedule publish (M1) | #40/#129/#142 | runtime | src/schedules (11 src/6 test); 1784700000000-CreateScheduleMinimumPublish | Architecture | P1 | — |
| Teacher/room/time-slot reference (M1) | #142/#144 | runtime | src/teachers, src/rooms, src/time-slots (test'li) | Architecture | P1 | — |
| Leave request + impact (M3) | #183/#203/#218 | runtime | src/leaves (12 src/4 test); 1802000000000/1803000000000 | Product | P1 | manager approval completeness (#263) |
| Attendance session lifecycle (M5) | #265 PR #328 | internal | src/attendance (7 src/2 test); 1826000000000-CreateAttendanceSessions | Product | P0 | DB-Smoke #330 blocks merge |
| Attendance record mark | #145/#249 | internal | src/attendance/attendance.entity.ts + service | Product | P1 | session lifecycle merge (#265) |
| Parent notification (M6) | #250/#266 | planning-only | src/notifications (3 src/1 test) | Product | P0 | consent + outbox (#266) |
| Reporting / eokul (M7) | #268 | planning-only | src/reports (4 src/1 test) | Product | P1 | quarantine runtime claims (#268) |
| RBAC / BOLA guard | #144/#220 | internal | src/rbac (11 src / **0 test**) | Security | P0 | **no RBAC unit test → BOLA risk** |
| Auth fail-closed secrets | #259 | runtime | src/auth/auth.service.ts loadJwtAccessSecret FATAL | Security | P0 | durable audit (#259 remaining) |
| KVKK redaction / audit | #259 | internal | src/common/audit (12 src); SecurityAuditService | Security/KVKK | P0 | durable transactional audit (#259) |
| HCO autonomous loop | #260 PR #326 | runtime | hco/ + tests/hco (11 test) | CTO | P1 | — |
| Tenant guard | #207 | runtime | test/database/tenant-guard.spec.ts | Data | P1 | — |
| Fresh-DB UI journey | #269 | planning-only | test/e2e: **0 specs** | QA | P0 | P0 browser E2E fail |

## Wrong-referral / gap notes
- Notification lineage (#250) references reports/eokul runtime that is `planning-only` (#268 quarantine).
- Attendance record mark (#249) depends on session lifecycle (#265) which is merge-blocked by #330.
- RBAC has **zero** unit tests despite BOLA being a P0 security gate — must not be reported complete.
- e2e count = 0 → P0 browser E2E and artifact evidence check cannot pass on any PR until #269 lands.

## Phase 1b scope (in-scope)
- TRUTH (#258) · SECURITY (#259) · HCO (#260 ✓) · LEAVE-OPS (#263) · ATTENDANCE (#265) ·
  NOTIFICATION (#266) · UX (#264) · REPORTING (#268) · ACCEPTANCE (#269)

## Phase 1b non-goal (explicit)
- Tercih-robotu (recommendation engine) — separate product, Faz 1B OUT OF SCOPE.
- Notion sync — local fallback (docs/ + agent-board-*.md) is canonical.
- Production auto-merge activation — HCO codepath DEFAULT OFF (fail-closed).

## Open gaps → linked issues
- #330 DB-Smoke repair-index preflight (blocks all migration PRs)
- #263 LEAVE-OPS manager approval completeness
- #265 ATTENDANCE session lifecycle (blocked by #330)
- #266 NOTIFICATION consent + outbox
- #264 UX role-aware Turkish shell (frontend src absent)
- #268 REPORTING quarantine
- #269 ACCEPTANCE fresh-DB UI journey (e2e = 0)
- #259 SECURITY durable audit (partial: secrets fail-closed done)

## Closure rule
A tracker is merge-ready ONLY when every P0/P1 row above has `runtime` or
`pilot-ready` classification with immutable evidence (HEAD SHA + test path + CI URL).
Current state: NOT merge-ready (RBAC 0-test, attendance/notification/reporting/ux/acceptance open).
