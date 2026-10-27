# Phase 1 Capability Truth Matrix

**Published:** 2026-08-29
**Last reconciled:** 2026-10-27 (branch `task/266-n3-main-merge` HEAD `b5b497a` — #479 mock-up envanter + kabul turu)
**Main HEAD:** b5b497a8356ea5b00adee9201adefc9a98f1976c
**Owner:** CTO (HCO loop)
**Purpose:** Reconcile Phase 1 claims with executable evidence. Classification is binding; a closed tracker with unchecked/HOLD criteria is NOT reported complete.

## Verification at this HEAD (2026-10-27)

Komutlar ayrı ayrı çalıştırıldı (PowerShell `&&` yok):

- `npx tsc -p tsconfig.json --noEmit` → 0 hata.
- `npx jest --runInBand src test/rbac test/kvkk test/database test/contracts` → Test Suites: 124 passed, 14 skipped (138 total); Tests: 1104 passed, 152 skipped (1256 total).
- `b5b497a` için dispatched GitHub Actions çalışması yok (bu reconcile doküman-only, kod değişimi yok). CI URL'leri aşağıda en son yeşil `main` (`ea75645be8b5`) çalışmalarıyla gösterilir; yerel doğrulama bu HEAD'de yapıldı ve yeşil.
- `docs/*` ve `src/database/migrations` `.gitignore` kapsamındadır → bu dosya `git add -f docs/phase1-truth-matrix.md` ile eklenecek.

## Classification legend

- `planning-only` — design/issue only, no runtime code or unproven
- `internal` — code exists but not pilot-verified / tests missing / blocked
- `runtime` — code + tests pass on main, operable in production path
- `pilot-ready` — runtime + genuine fresh-DB UI journey + pilot observation (#269)
- `quarantine / out-of-release-scope` — kod var ancak Faz 1'den karantinada/çıkarılmış (K-10, #268)

## Capability matrix

| Capability | Issue/PR lineage | Classification | Evidence (main HEAD b5b497a) | Owner | Severity | Missing / Block |
|---|---|---|---|---|---|---|
| Schedule publish (M1) | #40/#129/#142 | runtime | `src/schedules` (9 src / 5 spec; `solver/` 3); migration `1784700000000-CreateScheduleMinimumPublish`; `test/contracts/schedule-minimum-publish.spec.ts`, `m3-schedule-contract-v1.spec.ts`, `teacher-branch-preflight.spec.ts`; `test/database/schedule-service.spec.ts`. CI: Backend CI run 40530323765. `fixed:04bcb9fb12bcf9342a77df0c91a35074abc1515c` (durum ancası) | Architecture | P1 | — |
| Teacher/room/time-slot reference (M1) | #142/#144 | runtime | `src/teachers` (6 src / 3 spec), `src/rooms` (6 src / 6 spec), `src/time-slots` (6 src / 6 spec); migrations `1784022660000`, `1784022680000`, `1784520000000`, `1784577600000`. CI: Backend CI run 40530323765. `fixed:9cb3ad6cd12fa705463fd0ac9dae403fb065a0b1` (teachers ancası; rooms `629ba37f...`, time-slots `e5721a96...`) | Architecture | P1 | — |
| Leave request + impact (M3) | #183/#203/#218 | runtime | `src/leaves` (11 src / 4 spec); migrations `1802000000000-CreateLeaveRequestRuntime`, `1803000000000-CreateLeaveImpactOperations`; `test/contracts/leave-decision-impact.contract.spec.ts`, `leave-impact-operations.contract.spec.ts`, `leave-runtime.contract.spec.ts`; `test/database/leave-decision-transaction.spec.ts`, `leave-safety-queries.spec.ts`. CI: Backend CI run 40530323765. `fixed:66d3ca576aa3482186ab8b1e20bb62cce496dc70` | Product | P1 | manager approval completeness (#263 open) |
| Attendance record mark (M5) | #145/#249 | runtime | `src/attendance` (13 src / 7 spec): `attendance.entity.ts`, `attendance.service.ts` (+spec), `attendance-notes.ts` (#351 write-path redaction `43b6163`). CI: Backend CI run 40530323765. `fixed:43b616363a5d1d1d4cab5057e666f4e7ae3a2c1e` | Product | P1 | — |
| Attendance session lifecycle (M5) | #265; PR #346 `7b9887a`, #348 `0b1586c`, #349 `fa4abba`, #351 `43b6163`, #352 `c64d0a1` (tüm merged) | runtime | `src/attendance/attendance-session.{entity,service}.ts`, `attendance.controller.ts`, `teacher-own-lesson.guard.ts`, `attendance-access.service.ts`, `attendance-audit.adapter.ts`, `attendance-correction.ts`; migrations `1824000000000`, `1825000000000`, `1826000000000`, `1841000000000-AddSessionBranchSelection`; `test/database/create-attendance-sessions.migration.spec.ts`, `add-attendance-record-correction.migration.spec.ts`, `session-branch-continuity.spec.ts`; `test/database/schedule-service.spec.ts` (#349); `test/rbac/controller-enforcement-consistency.spec.ts` (#351). Modül toplamı `13 src / 7 spec`; migration sayısı 42. CI: Backend CI run 40530323765. `fixed:c64d0a1ea234cc35d3438e430d89ad572db3a173` (#352 capstone) | Product | P0 | #269 journey S5-B1/S5-B2; terminal rol verdict AC-8 |
| Parent notification (M6) | #250/#266 | internal | `src/notifications` (15 src / 9 spec): `absence-notification.service.ts`, `notification-outbox.{entity,repository}.ts`, `notification-log.entity.ts`, `parent-notification.service.ts`, `notification-dispatch.service.ts` + `notification-dispatch-receipt.entity.ts`, `notification-snapshot.ts`, `notification-simulator.service.ts`, `notification-draft.controller.ts/service.ts`; migrations `1829000000000-CreateNotificationOutbox`, `1860000000000-AddNotificationSnapshot`, `1870000000000-AddNotificationDispatch`, `1880000000000-AddConsentLegalBasisAndDeliveredStatus` (`delivered` durumu K-18); `test/database/notification-outbox.migration.spec.ts`, `notification-outbox-scope.spec.ts`, `notification-dispatch.db.spec.ts`, `notification-snapshot.db.spec.ts`; `test/kvkk/notification-payload-redaction.spec.ts`, `notification-approval.guard.spec.ts`. CI: Backend CI run 40530323765. `fixed:c64d0a1ea234cc35d3438e430d89ad572db3a173` (#352 outbox) | Product | P0 | relay/dispatcher `pending→dispatched` + `sent`↔`delivered` sınırı eksik; bounded retry + dead-letter/manual recovery; gerçek provider (Faz 2, K-10); redakte UI kanıtı; terminal verdict AC-8 (#266 tracker open) |
| Reporting / eokul (M7) | #268 | quarantine / out-of-release-scope | `src/reports` (4 src / 1 spec), `src/eokul-sync` (5 src / 1 spec); migrations `1810000000000-CreateReportsFoundation`, `1700000000100-CreateEokulSyncRuns`, `1700000000101-CreateAttendanceRecords`, `1805000000000-CreateEokulSyncImportsTable`; her ikisi `QUARANTINED_MODULES`, env-gated 503 (`app.module.spec.ts` pinli); `src/reports/reports.service.spec.ts`, `src/eokul-sync/eokul-sync.service.spec.ts`. CI: Backend CI run 40530323765. `fixed:439af3cd27b0dcc6adc89eb3bbec5d758bc2f084` (#371 quarantine enforcement, Refs #268) | Product | P1 | #268 Faz 2'ye defer (K-10): export güvenlik testleri (formül enjeksiyonu / cross-tenant) Faz 2; Faz 1'de yalnız truth-matrix `quarantine/out-of-release-scope` sınıflandırması + mevcut 503 kanıtı |
| RBAC / BOLA guard | #144/#220 | runtime | `src/rbac` (14 src) + `test/rbac/` (8 spec: okul-01-policy-engine, okul-01-rbac.service, permission-catalog, permission-decorator-consistency, permission-seed, tenant-repository-scope, controller-enforcement-consistency, security-context-default-deny); `src/rbac/rbac.controller.ts` sınıf düzeyi `@AuthGuard('jwt')`+`TenantScopeGuard`, her protected route'ta literal `@Permissions` (#351 sözleşmesi CI'de kırmızıya döner). CI: Backend CI run 40530323765; Gate 1 CI run 40530323744. `fixed:cf056bf2d014b30bf2ac1ff083d7e1ce30f115fb` (#223) | Security | P0 | — |
| Auth fail-closed secrets | #259 | runtime | `src/auth/auth.service.ts` `loadJwtAccessSecret` FATAL (fail-closed); `src/auth/auth-secret.spec.ts`; durable audit zinciri #352 (`c64d0a1`). CI: Backend CI run 40530323765. `fixed:2c4dbc55fde40289fba1d3b37a04e2c01cae788b` (#259/#277) | Security | P0 | terminal bağımsız verdict AC-8; #259 tracker AC listesi işaretsiz (open) |
| KVKK redaction / audit | #259 | runtime | `src/common/audit` (12 src / 9 spec): audit-chain, audit-log.repository, audit-query.service, audit-retention.{policy,service}, audit-tenant-query.builder, security-audit.service, transactional-audit-writer/scope, attendance-audit-metadata; migrations `1827000000000-AddAuditLogChain`, `1828000000000-AddAuditChainCheckpoints`; write-path redaction #351 (`43b6163`); `test/database/{audit-log-chain.migration,audit-chain-checkpoints.migration,audit-chain-concurrency,audit-retention.db,transactional-audit-writer}.spec.ts`; `test/kvkk/{audit-redaction,redaction-registry,action-metadata-allowlist,notification-payload-redaction}.spec.ts`. CI: Backend CI run 40530323765. `fixed:c64d0a1ea234cc35d3438e430d89ad572db3a173` (#352) | Security/KVKK | P0 | terminal bağımsız verdict AC-8; #259 tracker open (`AUDIT_HMAC_PREVIOUS_KEYS` rotasyonu uçtan uca yok) |
| HCO autonomous loop | #260 PR #326 | internal | `hco/` (canary.py, evidence.py, github_connector.py, run_real_canaries.py, state_machine.py; fail-closed, auto-merge DEFAULT OFF); `test/hco` dizini yok (Python canary, repo jest kapsamı dışı). CI: — (repo jest etkilemez). `fixed:a11036d97dc44272b93f1baf46a437b0d8092a46` (#326) | CTO | P1 | production auto-merge activation devre dışı (non-goal); pilot gözlemi #269 henüz |
| Tenant guard | #207 | runtime | `test/database/tenant-guard.spec.ts`; `src/common/tenant/tenant-scope.guard.runtime.spec.ts`, `tenant-hardening.spec.ts`, `tenant-context.middleware.spec.ts`. CI: Backend CI run 40530323765. `fixed:b1657617ab0e80bdfb5668b4f205d857236888c6` | Data | P1 | — |
| Fresh-DB UI journey | #269 PR #353 (S0-A1) | internal | `test/e2e/` (3 spec: runtime-shell-auth, stage5-full-journey, notifications-ops acceptance); `test/e2e/support/` 8 modül (env, browser, runtime-server, reference-fixtures, pg-client, acceptance-tables, artifact-scan, notification-preconditions); `test/acceptance-guard/acceptance-evidence.guard.spec.ts` (11 test) → `npm run test:e2e`, `npm run test:e2e:guard`. Harness PR #353 (`e823ebd`); 8/8 senaryo PASS, `jobOutcomeRowsCreated=0`, fresh DB + `src/main.ts` + gerçek tarayıcı (puppeteer-core Chromium, K-12); iş sonucu SQL seed + `page.evaluate(fetch)` fail-closed yasak. CI: P0 Browser E2E run 40516398164 (head `85c1197`); Backend CI run 40530323765. `fixed:e823ebd02b85b3996dfdf4bd08b04ce543852892` (#353 harness) | QA | P0 | Journey'in tamı (schedule→leave→approval→impact→assign/clear→attendance lock→notification), negatif matris, trace/video artefaktları, post-merge canary (S5-B1/S5-B2); terminal rol verdict AC-8 |
| UX / role-aware Turkish shell | #264 (GitHub: CLOSED) | planning-only | `frontend/src` YOK (K-64). Mock-up envanteri `frontend/design/` 20 dosya (shell, login, program, program-conflicts, program-builder, leave, leave-new, leave-detail, my-leaves, yoklama, yoklama-session, yoklama-absences, parent-notifications, parent-notifications-detail, users-roles, definitions, reports, 403, index, envanter); kanonik IA = `/ux` (Bugün merkezi, K-58); `/runtime` replacement (K-59; `frontend/runtime/` build artifact: app.js, schedule.js, attendance.js, consents.js, decisions.js, notifications.js, operations.js, styles.css); `frontend/app/` + `frontend/ux/` shell kaynağı; `test/frontend-runtime/` 16 spec + `test/runtime-integration/` 7 spec (WCAG/a11y/region-state/role-nav). CI: — (mock-up, üretim arayüzü yok). `fixed:b5b497a8356ea5b00adee9201adefc9a98f1976c` (#479 mock-up kabul turu) | QA/UX | P1 | `frontend/src` üretim yüzeyi yok; WCAG 2.1 AA durumları + E2E kanıtı yok; kod adaptasyonu izlek B (R8/R9) ayrı bilet; #264 GitHub CLOSED ancak executable gap (üretim yüzeyi/Yoklama/A11Y kanıtı) devam ediyor |

## Wrong-referral / gap notes (b5b497a bazlı, 2026-10-27)

### Kapatılan bulgular (kanıtla)

- **#330 DB-Smoke repair-index preflight** — CLOSED 2026-09-20 (#333/#335); migration PR'larını engellemez.
- **#348 attendance sertleştirme** — merged `0b1586c`: sınıf düzeyi JWT + tenant sınırı, her route'ta literal `@Permissions`, `users.id→teachers.id` çözümlemesi (`AttendanceAccessService`), fail-closed BOLA (guard + servis), `isUuid` 400, sunucu atamalı `markedById`. Önceki P0 bulgu (5 endpoint 403 + guard fail-open) KAPANDI.
- **#349 published-occurrence invariant + yayın/insert atomikliği** — merged `fa4abba`: TOCTOU ve `redactNotes` yazma-yolu bulgusu KAPANDI.
- **#351 not redaction + kontrollü düzeltme + `@Permissions` sözleşmesi** — merged `43b6163`: `test/rbac/controller-enforcement-consistency.spec.ts` eklendi; enforcement gap #339 AC-2 KAPANDI (yorum içine gizlenmiş/boş/dinamik `@Permissions` CI'de kırmızıya döner).
- **#352 eşzamanlılık + transactional audit + kilitli oturumdan idempotent outbox** — merged `c64d0a1`: `test/database/attendance-correction-concurrency.spec.ts` (iki paralel düzeltmeden tam olarak biri kazanır, diğeri 409); transactional attendance audit; notification outbox `1829000000000`; kilitli oturumdan atomik + idempotent domain event üretimi KAPANDI.
- **#355 acceptance-guard allowlist beyanı** — merged `3b75acc`: guard semantiği gevşetilmedi; `NON_ACCEPTANCE_EXEMPTIONS` gerekçe + bayat-girdi kontrolü.
- **#354 önceki truth reconcile** — merged `15c5ab8`: rol-farkındalıklı shell iddiası kanıta uygunlaştırıldı.
- **#371 reporting/eokul quarantine enforce** — merged `439af3c` (Refs #268): `QUARANTINED_MODULES` env-gated 503.
- **#479 (`b5b497a`, bu HEAD)** — mock-up envanteri `frontend/design/` + kabul turu; K-63/K-65 mock-up fazı kapatıldı; kod fazı (app/ux/runtime replacement + temizleme) izlek B'ye erteilt (ADR 0002, K-60).

### Düzeltilen / geçersiz referanslar

- Eski matris `test/hco (11 test)` iddiası **geçersiz**: `test/hco` dizini yok; HCO Python canary'dır, repo jest kapsamı dışı → satır 11 `internal` olarak düzeltildi (`fixed:a11036d...` #326 kod landed, pilot gözlemi yok).
- Eski matris `src/notifications (7 src / 2 spec)` bayat: `b5b497a`'da `15 src / 9 spec` (dispatch, snapshot, receipt, draft, `delivered` durumu K-18).
- Eski matris `test/rbac (7 spec)` bayat: `b5b497a`'da 8 spec (`security-context-default-deny.spec.ts` eklendi).
- Eski matris "migration sayısı 36" bayat: `b5b497a`'da **42** migration (+6: `1830` parent-contact-foundation, `1841` session-branch, `1850` kvkk-consent-version, `1860` notification-snapshot, `1870` notification-dispatch, `1880` consent-legal-basis+delivered).
- Eski matris `test/e2e (1 spec + 7 support modülü)` bayat: `b5b497a`'da **3 spec + 8 support** (`notification-preconditions.ts` eklendi).
- Notification lineage (#250) → reports/eokul runtime iddiamı `planning-only` (#268) değildir; #268 quarantine (K-10) → referans düzeltildi.
- #264 GitHub durumu CLOSED (2026-10-27, `gh` ile doğrulandı) ancak CONTEXT.md "stays OPEN" ifadesiyle çelişir; executable evidencia (`frontend/src` yok, WCAG 2.1 AA + E2E kanıtı yok) itibarıyla gap matrix'te açık kalır.

### Açık P0/P1 boşlukları → açık Phase 1b issue'ları (`gh` ile doğrulandı, hepsi OPEN)

| Gap | Linked Phase 1b issue | State (gh) | Milestone | Kalan kanıt |
|---|---|---|---|---|
| Auth/KVKK terminal verdict + tracker | #259 | OPEN | M0 | terminal bağımsız verdict AC-8; tracker AC listesi işaretsiz; `AUDIT_HMAC_PREVIOUS_KEYS` rotasyonu uçtan uca yok |
| Leave manager approval completeness | #263 | OPEN | M4 | manager approval, impact, coverage workflow tamlığı |
| Attendance session lifecycle (backend merged; journey続く) | #265 | OPEN | M5 | #269 journey S5-B1/S5-B2; terminal rol verdict AC-8 |
| Parent notification relay/provider/terminal verdict | #266 | OPEN | M6 | `pending→dispatched` + `sent`↔`delivered`; bounded retry + dead-letter; gerçek provider (Faz 2); redakte UI kanıtı; AC-8 |
| Reporting/eokul | #268 | OPEN | M7 | Faz 2'ye defer (K-10); Faz 1'de yalnız quarantine sınıflandırması + 503 kanıtı |
| Fresh-DB UI journey tamamı/negatif/canary | #269 | OPEN | M7 | journey'in tamamı, negatif matris, trace/video artefaktları, post-merge canary (S5-B1/S5-B2); AC-8 |
| UX üretim yüzeyi/WCAG/E2E | #264 | CLOSED | M7 | `frontend/src` yok; WCAG 2.1 AA + E2E kanıtı yok (issue durumu ile executable gap arasında farklılık, yukarıda notlandı) |

Her açık gap'in linked open Phase 1b issue'ı mevcut (yukarıdaki `gh` durumu). #264 hariç her açık gap henüz OPEN.

### UX satırı (`frontend/src` yok → mock-up envanteri)

`frontend/src` üretim yüzeyi yok (K-64). Kanonik IA = `/ux` IA (Bugün merkezi, K-58): Bugün → Program → İzinler → Yoklama → Veli Bilgilendirme → Tanımlar → Raporlar → Yönetim. `/runtime` replacement (K-59): nihai Faz 1 UI mevcut runtime yüzeyinin yerini alır; journey testleri yeni UI'ya migre edilir; `/ux` sentetik prototip K-59 ile replacement sonrası arşivlenir/silinir; `/app` login giriş kabuğu kalır. Mock-up evi = `frontend/design/` (20 dosya, K-65), geçici `.scratch/` değil. Kod adaptasyonu izlek B'nin R8/R9 adımında ayrı biletler olarak açılacak (K-60, ADR 0002).

## Phase 1b scope (in-scope)

- TRUTH (#258) · SECURITY (#259) · HCO (#260 ✓) · LEAVE-OPS (#263) · ATTENDANCE (#265) ·
  NOTIFICATION (#266) · UX (#264) · REPORTING (#268) · ACCEPTANCE (#269)

## Phase 1b non-goal (explicit)

- Tercih-robotu (recommendation engine) — separate product, Faz 1B OUT OF SCOPE.
- Notion sync — local fallback (docs/ + agent-board-*.md) is canonical.
- Production auto-merge activation — HCO codepath DEFAULT OFF (fail-closed).
- Gerçek SMS/e-posta/WhatsApp provider entegrasyonu (Faz 1 = sahte provider + dispatch audit) — Faz 2.
- Reporting/eokul complete + export güvenlik testleri — Faz 2 (K-10).
- Firefox/WebKit smoke — Faz 2 (K-12); Faz 1 E2E kanıtı Chromium ile.
- Ayrı frontend repo kararı — Faz 2 (K-13).

## Closure rule

A tracker is merge-ready ONLY when every P0/P1 row above has `runtime` or `pilot-ready` classification with immutable evidence (HEAD SHA + test path + CI URL), AND every P0/P1 gap is linked to an open Phase 1b issue.

Current state at b5b497a: **NOT merge-ready**. Gerekçe:
- `planning-only`: UX (#264) — `frontend/src` üretim yüzeyi yok.
- `quarantine / out-of-release-scope`: Reporting/eokul (M7, #268).
- `internal`: Parent notification (M6), Fresh-DB UI journey (#269), HCO (#260).
- Açık P0/P1 gaps: terminal bağımsız verdict AC-8 (#259/#266/#269), #269 journey tamamı + negatif matris + canary (S5-B1/S5-B2), #266 gerçek provider/retry/dead-letter, #263 manager approval tamlığı.

`runtime`/`pilot-ready` olmayan P0/P1 satırı kaldığı sürece, ve tüm açık gap'in linked open Phase 1b issue'ı olana sürece, tracker kapanmaz.

## Evidence CI URLs (en son yeşil, 2026-10-27)

- Backend CI (main `ea75645be8b5`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40530323765
- Sprint 1 Quality Gate (main `ea75645be8b5`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40530323959
- DB Smoke (main `ea75645be8b5`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40530323623
- Gate 1 CI (main `ea75645be8b5`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40530323744
- Main Governance Audit (main `ea75645be8b5`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40530323534
- GitGuardian scan (main `ea75645be8b5`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40530324021
- P0 Browser E2E (head `85c1197`, PR #446-alanı, #269): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40516398164

Not: `b5b497a` (bu branch HEAD) için dispatched CI çalışması yok (doküman-only reconcile). Yerel doğrulama (tsc + jest) bu HEAD'de yeşil — "Verification at this HEAD" bölümüne bakın. CI URL'leri en son yeşil `main` çalışmalarıdır; `b5b497a` kendi CI'si tetiklendiğinde bu URL'ler güncellenmelidir.

### Previous baseline (main HEAD 15c5ab8, 2026-09-23) — superseded by b5b497a

- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210991
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843211013
- DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210985
- Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210987
- Main Governance Audit: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843211054
- GitGuardian scan: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210995
