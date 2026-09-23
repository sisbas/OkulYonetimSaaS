# Phase 1 Capability Truth Matrix

**Published:** 2026-08-29
**Last reconciled:** 2026-09-23 (main HEAD e823ebd — #353 acceptance harness/yanlış-yeşil onarımı; #349/#351 attendance sertleştirmesi)
**Main HEAD:** e823ebd02b85b3996dfdf4bd08b04ce543852892
**Owner:** CTO (HCO loop)
**Purpose:** Reconcile Phase 1 claims with executable evidence. Classification is
binding; a closed tracker with unchecked/HOLD criteria is NOT reported complete.

## Classification legend
- `planning-only` — design/issue only, no runtime code or unproven
- `internal` — code exists but not pilot-verified / tests missing / blocked
- `runtime` — code + tests pass on main, operable in production path
- `pilot-ready` — runtime + genuine fresh-DB UI journey + pilot observation (#269)

## Capability matrix

| Capability | Issue/PR lineage | Classification | Evidence (main HEAD e823ebd) | Owner | Severity | Missing / Block |
|---|---|---|---|---|---|---|
| Schedule publish (M1) | #40/#129/#142 | runtime | src/schedules (11 src/6 test); 1784700000000-CreateScheduleMinimumPublish | Architecture | P1 | — |
| Teacher/room/time-slot reference (M1) | #142/#144 | runtime | src/teachers, src/rooms, src/time-slots (test'li) | Architecture | P1 | — |
| Leave request + impact (M3) | #183/#203/#218 | runtime | src/leaves (12 src/4 test); 1802000000000/1803000000000 | Product | P1 | manager approval completeness (#263) |
| Attendance record mark (M5) | #145/#249 | runtime | src/attendance: attendance.entity.ts + attendance.service.ts (+spec) — modül toplam 7 src/2 test | Product | P1 | — |
| Attendance session lifecycle (M5) | #265 PR #346 + #348 + #349 + #351 (merged) | internal | Kod main'de `e823ebd`: #346 çekirdeği (entity/service+spec/controller/guard; 1824000000000 + 1825000000000 migration; migration spec) + #348 sertleştirmesi (sınıf düzeyi `AuthGuard('jwt')`+`TenantScopeGuard`, her route'ta seed'li `@Permissions`, `AttendanceAccessService` ile `users.id→teachers.id` çözümlemesi, guard fail-closed + `isUuid` 400, servis katmanında BOLA, roster dışı öğrenci reddi, `listByTenant`, sunucu atamalı `markedById`) + **#349** (published-occurrence invariant'ı + sunucu atamalı şube: `src/attendance/attendance-session.service.ts`, `src/schedules/schedule.service.ts`; `test/database/schedule-service.spec.ts`) + **#351** (serbest metin notların yazma yolunda maskelenmesi: `src/attendance/attendance-notes.ts`; kontrollü düzeltme: `src/attendance/attendance-correction.ts` + `1826000000000-AddAttendanceRecordCorrection`; controller bazlı `@Permissions` sözleşmesi: `test/rbac/controller-enforcement-consistency.spec.ts`). Modül toplamı: **11 src / 7 spec**; migration sayısı 33. CI: Sprint 1 Quality Gate https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262506 | Product | P0 | kilitli yoklamadan idempotent domain event üretimi (#266 → S2-B1); #269 journey'inin tamamı (S5-B1/S5-B2); terminal rol verdict'leri (AC-8) |
| Parent notification (M6) | #250/#266 | planning-only | src/notifications (3 src/1 test) | Product | P0 | consent + outbox (#266) |
| Reporting / eokul (M7) | #268 | planning-only | src/reports (4 src/1 test) | Product | P1 | quarantine runtime claims (#268) |
| RBAC / BOLA guard | #144/#220 | runtime | src/rbac (11 src) + **test/rbac/ (7 spec: okul-01-policy-engine, okul-01-rbac.service, permission-catalog, permission-decorator-consistency, permission-seed, tenant-repository-scope, controller-enforcement-consistency)**. #351 ile controller bazlı `@Permissions` sözleşmesi zorunlu: metadata'sız protected controller (yorum içine gizlenmiş/boş/dinamik anahtar dahil) CI'da kırmızıya döner. CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262634 | Security | P0 | — |
| Auth fail-closed secrets | #259 | runtime | src/auth/auth.service.ts loadJwtAccessSecret FATAL | Security | P0 | durable audit (#259 remaining) |
| KVKK redaction / audit | #259 | internal | src/common/audit (6 src/4 test); SecurityAuditService | Security/KVKK | P0 | durable transactional audit (#259) |
| HCO autonomous loop | #260 PR #326 | runtime | hco/ + tests/hco (11 test) | CTO | P1 | — |
| Tenant guard | #207 | runtime | test/database/tenant-guard.spec.ts | Data | P1 | — |
| Fresh-DB UI journey | #269 PR #353 (S0-A1) | internal | `test/e2e`: **1 spec + 7 support modülü** (`runtime-shell-auth.e2e-spec.ts`; `support/{env,browser,runtime-server,reference-fixtures,pg-client,acceptance-tables,artifact-scan}.ts`) + `test/acceptance-guard/acceptance-evidence.guard.spec.ts` (11 test) → `npm run test:e2e`, `npm run test:e2e:guard`. **Yanlış-yeşil onarıldı:** legacy runner (iş sonucu SQL seed `schedule_events`/`leave_requests` + `page.evaluate(fetch)`) kabul rolünden çıkarıldı, dosya içi `ACCEPTANCE-EVIDENCE-EXCLUDED` ile işaretlendi ve workflow adımı kaldırıldı; P0 check artık gerçek harness'ı çalıştırır (fresh DB + `src/main.ts` + gerçek tarayıcı, görünür UI kontrolleri, 8/8 senaryo, `jobOutcomeRowsCreated=0`, `verdict=PASS`). Main CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262634 · P0 workflow (PR head `0b795b9`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35782140079 | QA | P0 | Journey'in tamamı (schedule→leave→approval→impact→assignment→attendance→notification), negatif matris (invalid date/stale/forbidden/session expiry/cross-tenant/offline), trace/video artefaktları ve post-merge canary → **S5-B1/S5-B2** |

## Wrong-referral / gap notes
- Notification lineage (#250) references reports/eokul runtime that is `planning-only` (#268 quarantine).
- Attendance session lifecycle (#265): #346 çekirdeği main'e merge edildi (squash `7b9887a`, 2026-09-21, PR head `40e8341`), ardından **#348 sertleştirmesi main'e girdi** (`0b1586c`, PR #348): sınıf düzeyi JWT + tenant sınırı, her route'ta seed'li `@Permissions`, `users.id→teachers.id` çözümlemesi (`AttendanceAccessService`), fail-closed BOLA (guard + servis katmanı), `isUuid` ile 400, sunucu atamalı `markedById`. **Önceki nottaki iki P0 bulgu (5 endpoint 403 + guard fail-open) bu merge ile kapandı.** PR #328/#337 CLOSED-superseded (commit'ler `refs/pull/328/head`, `refs/pull/337/head`). Hâlâ eksik: kilitli yoklamadan idempotent domain event üretimi (#266 → S2-B1), #269 journey'inin tamamı (S5-B1/S5-B2) ve terminal rol verdict'leri (AC-8) — bu nedenle issue açık kalır.
- **#349 (published-occurrence invariant'ı + yayın/insert atomikliği) ve #351 (not redaction + controller bazlı `@Permissions` sözleşmesi) main'e girdi** (`fa4abba`, `43b6163`): yukarıdaki notta "açık" sayılan TOCTOU ve `redactNotes` yazma-yolu bulguları KAPANDI. Migration sayısı 33 (`1826000000000-AddAttendanceRecordCorrection`).
- #330 DB-Smoke repair-index preflight is **CLOSED** (2026-09-20; resolved via PR #333 repair-index bootstrap + PR #335 schema-qualified bootstrap DDL). It no longer blocks migration PRs.
- RBAC: `src/rbac` has 11 src + `test/rbac/` has **7** spec files (okul-01-policy-engine, okul-01-rbac.service, permission-catalog, permission-decorator-consistency, permission-seed, tenant-repository-scope, controller-enforcement-consistency) → BOLA is tested, NOT a 0-test gap. (Corrected after review; 7th spec added by #351.)
- Enforcement gap (#339 AC-2): **KAPANDI** — #351 ile `test/rbac/controller-enforcement-consistency.spec.ts` eklendi. Her `@Controller` route'u için auth guard + **literal** `@Permissions` zorunludur; yorum içine gizlenmiş decorator, boş `@Permissions()`, dinamik anahtar ve literal olmayan path ifadeleri (`<expr:...>`) bulgu sayılır; public route allowlist'i exact tutulur ve bayat girdi kırmızıya döner. `permission-decorator-consistency.spec.ts` (kullanılan anahtarların seed üyeliği) ikinci savunma hattı olarak kalır. Bu boşluk nedeniyle attendance-session controller'daki auth/BOLA eksikliği mimari test tarafından yakalanamamıştı (#348 ile giderildi, #351 ile test kapatıldı).
- UX (#264): `frontend/src` is still ABSENT, but role-aware Turkish shell source now exists under `frontend/ux/` (index.html, store.js, spec.md, start.js) and `frontend/app/` (index.html, ui.js, style.css, mark.svg, start.js); `frontend/runtime/` remains the build artifact (#327 runtime shell, #342 Faz 1 operational UX). #264 stays OPEN — WCAG 2.1 AA states and E2E evidence not produced.
- Acceptance evidence integrity (#269, PR #353): `test/e2e/` artık **1 spec + 7 support modülü** içerir ve `test/acceptance-guard/acceptance-evidence.guard.spec.ts` (11 test) iş sonucu SQL seed'ini (`leave_requests`, `schedule_events`, `attendance_records`, `notification_logs`, …), `page.evaluate` içinde ağ isteğini ve DOM imalatını **fail-closed** yasaklar. Legacy runner (iş sonucu SQL seed + `page.evaluate(fetch)`) kabul rolünden çıkarıldı, dosya içi işaretle "acceptance dışı" yapıldı ve workflow'dan kaldırıldı → P0 browser E2E check'i artık **gerçek** doğrulama yapıyor (eskiden iş sonucunu SQL ile üretip UI'yi atlayarak yeşil görünüyordu). Kalan boşluk: journey'in tamamı + negatif matris + trace/video artefaktları (S5-B1/S5-B2).

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
- #265 ATTENDANCE session lifecycle — **merged** (PR #346, `7b9887a`), **sertleştirildi** (PR #348, `0b1586c`), **published-occurrence invariant + yayın/insert atomikliği** (PR #349, `fa4abba`) ve **not redaction + kontrollü düzeltme + `@Permissions` sözleşmesi** (PR #351, `43b6163`) main'de; remaining: locked-absence idempotent domain event (#266 → S2-B1), #269 journey'inin tamamı (S5-B1/S5-B2), terminal rol verdict'leri (AC-8)
- #266 NOTIFICATION consent + outbox
- #264 UX role-aware Turkish shell (frontend `src` absent; shell source in `frontend/app/` + `frontend/ux/`)
- #268 REPORTING quarantine
- #269 ACCEPTANCE fresh-DB UI journey — **harness landı** (PR #353, `e823ebd`): fresh DB + `src/main.ts` + gerçek tarayıcı ile 8/8 senaryo, `jobOutcomeRowsCreated=0`; iş sonucu SQL seed'i ve `page.evaluate(fetch)` statik guard ile yasaklandı, legacy yanlış-yeşil runner kabul rolünden çıkarıldı. Remaining: journey'in tamamı, negatif matris, trace/video artefaktları, post-merge canary (S5-B1/S5-B2)
- #259 SECURITY durable audit (partial: secrets fail-closed done)

## Closure rule
A tracker is merge-ready ONLY when every P0/P1 row above has `runtime` or
`pilot-ready` classification with immutable evidence (HEAD SHA + test path + CI URL).
Current state: **NOT merge-ready** (main `e823ebd`). Gerekçe:
- `planning-only`: Parent notification (M6), Reporting/eokul (M7) — runtime iddiaları karantinada.
- `internal`: Attendance session lifecycle (M5) — invariant/atomiklik/redaction/correction main'de, kalan AC'ler (locked-absence event, terminal verdict'ler) açık. Fresh-DB UI journey (#269) — harness + ilk journey yeşil, journey'in tamamı + negatif matris açık.
- UX (#264): rol-farkındalıklı shell ve WCAG durumları üretilmedi.
- Ayrıca açık PR #352 (`#259` durable audit / notification outbox) main'e girmediği sürece NOTIFICATION satırı `planning-only` kalır.
`runtime` veya `pilot-ready` olmayan bir P0/P1 satırı kaldığı sürece tracker kapanmaz.

## Evidence CI URLs (main HEAD e823ebd, last green 2026-09-23)
- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262634
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262506
- DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262559
- Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262441
- Main Governance Audit: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262501
- GitGuardian scan: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35817262566
- PR #353 (acceptance harness, S0-A1) merge öncesi head `0b795b9` required checks: P0 browser E2E `35782140079` SUCCESS; Backend CI `35782139979` SUCCESS; Sprint 1 Quality Gate `35782140088` SUCCESS; DB Smoke `35782140022` SUCCESS; Gate 1 CI `35782140037` SUCCESS; PR Governance `35782568425` SUCCESS
- PR #353 artefaktı (`report.json`): `headSha` = PR head, `verdict=PASS`, 8/8 senaryo PASS, `jobOutcomeRowsCreated=0`, `backend.pid`/`portOwnershipProved` kayıtlı, `leakScan` gerçek tarama (`findingCount=0`)

### Previous baseline (main HEAD 0b1586c, 2026-09-21)
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
