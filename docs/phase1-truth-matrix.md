# Phase 1 Capability Truth Matrix

**Published:** 2026-08-29
**Last reconciled:** 2026-09-21 (main HEAD 0b1586c — #265 attendance auth/BOLA hardening merge, PR #348)
**Main HEAD:** 0b1586c02504d84de6314352ad563e46b4e627c2
**Owner:** CTO (HCO loop)
**Purpose:** Reconcile Phase 1 claims with executable evidence. Classification is
binding; a closed tracker with unchecked/HOLD criteria is NOT reported complete.

## Classification legend
- `planning-only` — design/issue only, no runtime code or unproven
- `internal` — code exists but not pilot-verified / tests missing / blocked
- `runtime` — code + tests pass on main, operable in production path
- `pilot-ready` — runtime + genuine fresh-DB UI journey + pilot observation (#269)

## Capability matrix

| Capability | Issue/PR lineage | Classification | Evidence (main HEAD 0b1586c) | Owner | Severity | Missing / Block |
|---|---|---|---|---|---|---|
| Schedule publish (M1) | #40/#129/#142 | runtime | src/schedules (11 src/6 test); 1784700000000-CreateScheduleMinimumPublish | Architecture | P1 | — |
| Teacher/room/time-slot reference (M1) | #142/#144 | runtime | src/teachers, src/rooms, src/time-slots (test'li) | Architecture | P1 | — |
| Leave request + impact (M3) | #183/#203/#218 | runtime | src/leaves (12 src/4 test); 1802000000000/1803000000000 | Product | P1 | manager approval completeness (#263) |
| Attendance record mark (M5) | #145/#249 | runtime | src/attendance: attendance.entity.ts + attendance.service.ts (+spec) — modül toplam 7 src/2 test | Product | P1 | — |
| Attendance session lifecycle (M5) | #265 PR #346 + PR #348 (merged) | internal | Kod main'de `0b1586c`: #346 çekirdeği (entity/service+spec/controller/guard; 1824000000000 + 1825000000000 migration; migration spec) + #348 sertleştirmesi (sınıf düzeyi `AuthGuard('jwt')`+`TenantScopeGuard`, her route'ta seed'li `@Permissions`, `AttendanceAccessService` ile `users.id→teachers.id` çözümlemesi, guard fail-closed + `isUuid` 400, servis katmanında BOLA, roster dışı öğrenci reddi, `listByTenant`, sunucu atamalı `markedById`). Yerel: attendance+rBAC+migration 112/112, tam unit 475/475, runtime-integration 52/52 | Product | P0 | published-occurrence invariant'ı + yayın/insert atomikliği ve create'te boş roster reddi (PR #349 açık); notes redaction yazma yolunda yok; controlled correction + locked-absence event (#266); fresh-DB UI journey (#269); terminal rol verdict'leri (AC-8) |
| Parent notification (M6) | #250/#266 | planning-only | src/notifications (3 src/1 test) | Product | P0 | consent + outbox (#266) |
| Reporting / eokul (M7) | #268 | planning-only | src/reports (4 src/1 test) | Product | P1 | quarantine runtime claims (#268) |
| RBAC / BOLA guard | #144/#220 | runtime | src/rbac (11 src) + **test/rbac/ (6 spec: okul-01-policy-engine, okul-01-rbac.service, permission-catalog, permission-decorator-consistency, permission-seed, tenant-repository-scope)** | Security | P0 | — |
| Auth fail-closed secrets | #259 | runtime | src/auth/auth.service.ts loadJwtAccessSecret FATAL | Security | P0 | durable audit (#259 remaining) |
| KVKK redaction / audit | #259 | internal | src/common/audit (6 src/4 test); SecurityAuditService | Security/KVKK | P0 | durable transactional audit (#259) |
| HCO autonomous loop | #260 PR #326 | runtime | hco/ + tests/hco (11 test) | CTO | P1 | — |
| Tenant guard | #207 | runtime | test/database/tenant-guard.spec.ts | Data | P1 | — |
| Fresh-DB UI journey | #269 | planning-only | test/e2e: **0 specs** | QA | P0 | P0 browser E2E fail |

## Wrong-referral / gap notes
- Notification lineage (#250) references reports/eokul runtime that is `planning-only` (#268 quarantine).
- Attendance session lifecycle (#265): #346 çekirdeği main'e merge edildi (squash `7b9887a`, 2026-09-21, PR head `40e8341`), ardından **#348 sertleştirmesi main'e girdi** (`0b1586c`, PR #348): sınıf düzeyi JWT + tenant sınırı, her route'ta seed'li `@Permissions`, `users.id→teachers.id` çözümlemesi (`AttendanceAccessService`), fail-closed BOLA (guard + servis katmanı), `isUuid` ile 400, sunucu atamalı `markedById`. **Önceki nottaki iki P0 bulgu (5 endpoint 403 + guard fail-open) bu merge ile kapandı.** PR #328/#337 CLOSED-superseded (commit'ler `refs/pull/328/head`, `refs/pull/337/head`). Hâlâ eksik: `createFromPublishedOccurrence` yayın durumunu doğrulamıyor ve yayın kontrolü insert ile atomik değil (TOCTOU) — düzeltme **PR #349**'da açık; `AttendanceService.redactNotes` yazma yolunda çağrılmıyor. Bu eksikler #265 AC-2/AC-5/AC-6/AC-8'i karşılamaz → issue açık kalır.
- #330 DB-Smoke repair-index preflight is **CLOSED** (2026-09-20; resolved via PR #333 repair-index bootstrap + PR #335 schema-qualified bootstrap DDL). It no longer blocks migration PRs.
- RBAC: `src/rbac` has 11 src + `test/rbac/` has 6 spec files (okul-01-policy-engine, okul-01-rbac.service, permission-catalog, permission-decorator-consistency, permission-seed, tenant-repository-scope) → BOLA is tested, NOT a 0-test gap. (Corrected after review.)
- Enforcement gap: `test/rbac/permission-decorator-consistency.spec.ts` yalnızca **kullanılan** `@Permissions(...)` anahtarlarının seed'de bulunduğunu doğrular (global `used.length > 0` şartı + her anahtarın seed üyeliği). Controller bazında enforcement varlığını doğrulamaz → `@Permissions` metadata'sı hiç olmayan bir protected controller bu testten geçer. Bu boşluk nedeniyle attendance-session controller'daki auth/BOLA eksikliği mimari test tarafından yakalanmadı; eksiklik #348 ile giderildi ancak test hâlâ controller bazında enforcement'ı denetlemiyor (#339 AC-2 kapsamı).
- UX (#264): `frontend/src` is still ABSENT, but role-aware Turkish shell source now exists under `frontend/ux/` (index.html, store.js, spec.md, start.js) and `frontend/app/` (index.html, ui.js, style.css, mark.svg, start.js); `frontend/runtime/` remains the build artifact (#327 runtime shell, #342 Faz 1 operational UX). #264 stays OPEN — WCAG 2.1 AA states and E2E evidence not produced.
- e2e count = 0 → P0 browser E2E and artifact evidence check cannot pass on any PR until #269 lands.

## Phase 1b scope (in-scope)
- TRUTH (#258) · SECURITY (#259) · HCO (#260 ✓) · LEAVE-OPS (#263) · ATTENDANCE (#265) ·
  NOTIFICATION (#266) · UX (#264) · REPORTING (#268) · ACCEPTANCE (#269)

## Phase 1b non-goal (explicit)
- Tercih-robotu (recommendation engine) — separate product, Faz 1B OUT OF SCOPE.
- Notion sync — local fallback (docs/ + agent-board-*.md) is canonical.
- Production auto-merge activation — HCO codepath DEFAULT OFF (fail-closed).

## Open gaps → linked issues
- ~~#330 DB-Smoke repair-index preflight~~ — CLOSED 2026-09-20 (#333/#335); no longer blocks migration PRs
- #263 LEAVE-OPS manager approval completeness
- #265 ATTENDANCE session lifecycle — **merged** (PR #346, `7b9887a`) ve **sertleştirildi** (PR #348, `0b1586c`); remaining: published-invariant + atomiklik (PR #349 açık), notes redaction, controlled correction, locked-absence domain event (#266), fresh-DB UI journey (#269)
- #266 NOTIFICATION consent + outbox
- #264 UX role-aware Turkish shell (frontend `src` absent; shell source in `frontend/app/` + `frontend/ux/`)
- #268 REPORTING quarantine
- #269 ACCEPTANCE fresh-DB UI journey (e2e = 0)
- #259 SECURITY durable audit (partial: secrets fail-closed done)

## Closure rule
A tracker is merge-ready ONLY when every P0/P1 row above has `runtime` or
`pilot-ready` classification with immutable evidence (HEAD SHA + test path + CI URL).
Current state: NOT merge-ready (notification/reporting/ux/acceptance open; attendance session lifecycle = `internal` — çekirdek + auth/BOLA main'de, published-invariant/atomiklik (PR #349) ve kalan AC'ler açık).

## Evidence CI URLs (main HEAD 0b1586c, last green 2026-09-21)
- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35644713940
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35644713784
- DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35644713816
- Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35644713824
- Main Governance Audit: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35644713750
- GitGuardian scan: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35644713766
- PR #348 merge öncesi head (5212399) required checks: Backend CI 35643867368 SUCCESS; Sprint 1 Quality Gate 35643867429 SUCCESS; DB Smoke 35643867437 SUCCESS; Gate 1 CI 35643867357 SUCCESS

### Previous baseline (main HEAD 7b9887a, 2026-09-21)
- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579777043
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579777038
- DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579777148
- Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579777079
- Main Governance Audit: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579777074
- GitGuardian scan: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579777042
- PR #346 (head 40e8341) PR Governance: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579187291
- PR #346 (head 40e8341) Sensitive Pattern Scanner: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35579187315

### Earlier baseline (main HEAD a11036d, 2026-08-29)
- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/32980316754
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/32980316858
- DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/32980316860
