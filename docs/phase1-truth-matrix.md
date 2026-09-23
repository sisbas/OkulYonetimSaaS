# Phase 1 Capability Truth Matrix

**Published:** 2026-08-29
**Last reconciled:** 2026-09-23 (main HEAD 15c5ab8 — #352 durable audit zinciri + notification outbox; #355 acceptance-guard allowlist onarımı; #354 truth reconcile)
**Main HEAD:** 15c5ab8d44f21b3165cf50658fadbc42b4bd68ae
**Owner:** CTO (HCO loop)
**Purpose:** Reconcile Phase 1 claims with executable evidence. Classification is
binding; a closed tracker with unchecked/HOLD criteria is NOT reported complete.

## Classification legend
- `planning-only` — design/issue only, no runtime code or unproven
- `internal` — code exists but not pilot-verified / tests missing / blocked
- `runtime` — code + tests pass on main, operable in production path
- `pilot-ready` — runtime + genuine fresh-DB UI journey + pilot observation (#269)

## Capability matrix

| Capability | Issue/PR lineage | Classification | Evidence (main HEAD 15c5ab8) | Owner | Severity | Missing / Block |
|---|---|---|---|---|---|---|
| Schedule publish (M1) | #40/#129/#142 | runtime | src/schedules (11 src/6 test); 1784700000000-CreateScheduleMinimumPublish | Architecture | P1 | — |
| Teacher/room/time-slot reference (M1) | #142/#144 | runtime | src/teachers, src/rooms, src/time-slots (test'li) | Architecture | P1 | — |
| Leave request + impact (M3) | #183/#203/#218 | runtime | src/leaves (12 src/4 test); 1802000000000/1803000000000 | Product | P1 | manager approval completeness (#263) |
| Attendance record mark (M5) | #145/#249 | runtime | src/attendance: attendance.entity.ts + attendance.service.ts (+spec) — modül toplam **13 src / 7 spec** | Product | P1 | — |
| Attendance session lifecycle (M5) | #265 PR #346 + #348 + #349 + #351 + #352 (merged) | internal | Kod main'de `15c5ab8`: #346 çekirdeği (entity/service+spec/controller/guard; 1824000000000 + 1825000000000 migration; migration spec) + #348 sertleştirmesi (sınıf düzeyi `AuthGuard('jwt')`+`TenantScopeGuard`, her route'ta seed'li `@Permissions`, `AttendanceAccessService` ile `users.id→teachers.id` çözümlemesi, guard fail-closed + `isUuid` 400, servis katmanında BOLA, roster dışı öğrenci reddi, `listByTenant`, sunucu atamalı `markedById`) + **#349** (published-occurrence invariant'ı + sunucu atamalı şube: `src/attendance/attendance-session.service.ts`, `src/schedules/schedule.service.ts`; `test/database/schedule-service.spec.ts`) + **#351** (serbest metin notların yazma yolunda maskelenmesi: `src/attendance/attendance-notes.ts`; kontrollü düzeltme: `src/attendance/attendance-correction.ts` + `1826000000000-AddAttendanceRecordCorrection`; controller bazlı `@Permissions` sözleşmesi: `test/rbac/controller-enforcement-consistency.spec.ts`) + **#352** (kontrollü düzeltme eşzamanlılığı: `test/database/attendance-correction-concurrency.spec.ts` — aynı `expectedVersion` ile iki paralel düzeltmeden tam olarak biri kazanır, diğeri 409 alır; transactional attendance audit: `src/attendance/attendance-audit.adapter.ts`). Modül toplamı: **13 src / 7 spec**; migration sayısı 36. CI: Sprint 1 Quality Gate https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843211013 | Product | P0 | #269 journey'inin tamamı (S5-B1/S5-B2); terminal rol verdict'leri (AC-8) |
| Parent notification (M6) | #250/#266 | internal | Kilitli oturumdan **atomik + idempotent** outbox ve onay kapısı main'de (`c64d0a1`): `src/notifications` (**7 src / 2 spec**: absence-notification.service + adapter, notification-outbox.{entity,repository}, notification-log.entity, parent-notification.service) + `1829000000000-CreateNotificationOutbox` + `test/database/notification-outbox.migration.spec.ts`; onay/uygunluk guard'ları `src/kvkk` (consent.guard, notification-approval.guard, notification-eligibility.service). `dedupe_key` + `ON CONFLICT DO NOTHING` (idempotent), `payload_masked` PII'siz, onay yoksa `blocked_consent` (fail-closed), draft/published oturum hiç satır üretmez | Product | P0 | relay/dispatcher yok (`pending→dispatched`; `sent`/`delivered` ayrımı yok); bounded retry + dead-letter/manual recovery; gerçek provider entegrasyonu; redakte UI kanıtı; terminal verdict'ler (#266 tracker açık) |
| Reporting / eokul (M7) | #268 | planning-only | src/reports (4 src/1 test) | Product | P1 | quarantine runtime claims (#268) |
| RBAC / BOLA guard | #144/#220 | runtime | src/rbac (11 src) + **test/rbac/ (7 spec: okul-01-policy-engine, okul-01-rbac.service, permission-catalog, permission-decorator-consistency, permission-seed, tenant-repository-scope, controller-enforcement-consistency)**. #351 ile controller bazlı `@Permissions` sözleşmesi zorunlu: metadata'sız protected controller (yorum içine gizlenmiş/boş/dinamik anahtar dahil) CI'da kırmızıya döner. CI (main `15c5ab8`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210991 | Security | P0 | — |
| Auth fail-closed secrets | #259 | runtime | src/auth/auth.service.ts loadJwtAccessSecret FATAL | Security | P0 | durable audit `#352` ile main'de; kalan: terminal bağımsız verdict'ler (AC-8) — #259 tracker açık |
| KVKK redaction / audit | #259 | internal | **Durable audit zinciri main'de** (`c64d0a1`): `src/common/audit` (**12 src / 9 spec**: audit-chain, audit-log.repository, audit-query.service, audit-retention.policy, audit-retention.service, audit-tenant-query.builder, security-audit.service, transactional-audit-writer, transactional-audit-scope, attendance-audit-metadata) + migrations `1827000000000-AddAuditLogChain`, `1828000000000-AddAuditChainCheckpoints` + DB kanıtı `test/database/{audit-log-chain.migration, audit-chain-checkpoints.migration, audit-chain-concurrency, audit-retention.db, transactional-audit-writer}.spec.ts`: tamper-evident zincir (seq + prev_hash + entry_hash + HMAC imza, advisory lock ile serileştirme), retention policy ve tenant-scoped sorgu. Yazma-yolu redaction `#351` ile main'de | Security/KVKK | P0 | terminal bağımsız verdict'ler (AC-8) — #259 tracker açık (AC listesi işaretsiz) |
| HCO autonomous loop | #260 PR #326 | runtime | hco/ + tests/hco (11 test) | CTO | P1 | — |
| Tenant guard | #207 | runtime | test/database/tenant-guard.spec.ts | Data | P1 | — |
| Fresh-DB UI journey | #269 PR #353 (S0-A1) | internal | `test/e2e`: **1 spec + 7 support modülü** (`runtime-shell-auth.e2e-spec.ts`; `support/{env,browser,runtime-server,reference-fixtures,pg-client,acceptance-tables,artifact-scan}.ts`) + `test/acceptance-guard/acceptance-evidence.guard.spec.ts` (11 test) → `npm run test:e2e`, `npm run test:e2e:guard`. **Yanlış-yeşil onarıldı:** legacy runner (iş sonucu SQL seed `schedule_events`/`leave_requests` + `page.evaluate(fetch)`) kabul rolünden çıkarıldı, dosya içi `ACCEPTANCE-EVIDENCE-EXCLUDED` ile işaretlendi ve workflow adımı kaldırıldı; P0 check artık gerçek harness'ı çalıştırır (fresh DB + `src/main.ts` + gerçek tarayıcı, görünür UI kontrolleri, 8/8 senaryo, `jobOutcomeRowsCreated=0`, `verdict=PASS`). Kabul-kanıtı guard'ı `#355` ile main'de yeniden yeşil (`3b75acc`): #352'nin eklediği `test/database/attendance-correction-concurrency.spec.ts` exact allowlist'e "kabul kanıtı değil" olarak beyan edildi (gerekçe + bayat-girdi kontrolü), guard semantiği gevşetilmedi. Main CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210991 · P0 workflow (PR head `0b795b9`): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35782140079 | QA | P0 | Journey'in tamamı (schedule→leave→approval→impact→assignment→attendance→notification), negatif matris (invalid date/stale/forbidden/session expiry/cross-tenant/offline), trace/video artefaktları ve post-merge canary → **S5-B1/S5-B2** |

## Wrong-referral / gap notes
- Notification lineage (#250) references reports/eokul runtime that is `planning-only` (#268 quarantine).
- Attendance session lifecycle (#265): #346 çekirdeği main'e merge edildi (squash `7b9887a`, 2026-09-21, PR head `40e8341`), ardından **#348 sertleştirmesi main'e girdi** (`0b1586c`, PR #348): sınıf düzeyi JWT + tenant sınırı, her route'ta seed'li `@Permissions`, `users.id→teachers.id` çözümlemesi (`AttendanceAccessService`), fail-closed BOLA (guard + servis katmanı), `isUuid` ile 400, sunucu atamalı `markedById`. **Önceki nottaki iki P0 bulgu (5 endpoint 403 + guard fail-open) bu merge ile kapandı.** PR #328/#337 CLOSED-superseded (commit'ler `refs/pull/328/head`, `refs/pull/337/head`). Hâlâ eksik: #269 journey'inin tamamı (S5-B1/S5-B2) ve terminal rol verdict'leri (AC-8) — bu nedenle issue açık kalır. **Kilitli yoklamadan idempotent domain event üretimi `#352` ile KAPANDI** (kilit transaction'ı içinde outbox; aşağıdaki #352/#355 notu).
- **#349 (published-occurrence invariant'ı + yayın/insert atomikliği) ve #351 (not redaction + controller bazlı `@Permissions` sözleşmesi) main'e girdi** (`fa4abba`, `43b6163`): yukarıdaki notta "açık" sayılan TOCTOU ve `redactNotes` yazma-yolu bulguları KAPANDI. Migration sayısı 36 (PR #352 sonrası: `1827000000000-AddAuditLogChain`, `1828000000000-AddAuditChainCheckpoints`, `1829000000000-CreateNotificationOutbox`).
- #330 DB-Smoke repair-index preflight is **CLOSED** (2026-09-20; resolved via PR #333 repair-index bootstrap + PR #335 schema-qualified bootstrap DDL). It no longer blocks migration PRs.
- RBAC: `src/rbac` has 11 src + `test/rbac/` has **7** spec files (okul-01-policy-engine, okul-01-rbac.service, permission-catalog, permission-decorator-consistency, permission-seed, tenant-repository-scope, controller-enforcement-consistency) → BOLA is tested, NOT a 0-test gap. (Corrected after review; 7th spec added by #351.)
- Enforcement gap (#339 AC-2): **KAPANDI** — #351 ile `test/rbac/controller-enforcement-consistency.spec.ts` eklendi. Her `@Controller` route'u için auth guard + **literal** `@Permissions` zorunludur; yorum içine gizlenmiş decorator, boş `@Permissions()`, dinamik anahtar ve literal olmayan path ifadeleri (`<expr:...>`) bulgu sayılır; public route allowlist'i exact tutulur ve bayat girdi kırmızıya döner. `permission-decorator-consistency.spec.ts` (kullanılan anahtarların seed üyeliği) ikinci savunma hattı olarak kalır. Bu boşluk nedeniyle attendance-session controller'daki auth/BOLA eksikliği mimari test tarafından yakalanamamıştı (#348 ile giderildi, #351 ile test kapatıldı).
- UX (#264): `frontend/src` is still ABSENT, but role-aware Turkish shell source now exists under `frontend/ux/` (index.html, store.js, spec.md, start.js) and `frontend/app/` (index.html, ui.js, style.css, mark.svg, start.js); `frontend/runtime/` remains the build artifact (#327 runtime shell, #342 Faz 1 operational UX). #264 stays OPEN — WCAG 2.1 AA states and E2E evidence not produced.
- Acceptance evidence integrity (#269, PR #353): `test/e2e/` artık **1 spec + 7 support modülü** içerir ve `test/acceptance-guard/acceptance-evidence.guard.spec.ts` (11 test) iş sonucu SQL seed'ini (`leave_requests`, `schedule_events`, `attendance_records`, `notification_logs`, …), `page.evaluate` içinde ağ isteğini ve DOM imalatını **fail-closed** yasaklar. Legacy runner (iş sonucu SQL seed + `page.evaluate(fetch)`) kabul rolünden çıkarıldı, dosya içi işaretle "acceptance dışı" yapıldı ve workflow'dan kaldırıldı → P0 browser E2E check'i artık **gerçek** doğrulama yapıyor (eskiden iş sonucunu SQL ile üretip UI'yi atlayarak yeşil görünüyordu). Kalan boşluk: journey'in tamamı + negatif matris + trace/video artefaktları (S5-B1/S5-B2).
- **#352 main'e girdi** (`c64d0a1`, 2026-09-23): tamper-evident audit zinciri + checkpoint + retention (`1827000000000`, `1828000000000`), transactional attendance audit, kontrollü düzeltme eşzamanlılığı kanıtı (`test/database/attendance-correction-concurrency.spec.ts`), notification outbox (`1829000000000`) ve kilitli oturumdan idempotent domain event üretimi.
- **#355 main'e girdi** (`3b75acc`, 2026-09-23): #352 ile gelen eşzamanlılık spec'i kabul-kanıtı guard'ının `NON_ACCEPTANCE_EXEMPTIONS` listesine gerekçe + bayat-girdi kontrolü ile beyan edildi; guard semantiği gevşetilmedi. Bu, guard'ın beyan edilmemiş yeni test yüzeylerini gerçekten yakaladığının kanıtıdır (`main` @ `c64d0a1` kısa süreli kırmızıydı; `#355` onardı).
- **#354 main'e girdi** (`15c5ab8`, 2026-09-23): bir önceki truth reconcile (main `e823ebd`) ve review bulgusu düzeltmesi (rol-farkındalıklı shell iddiasının kanıtla uyumlu hâle getirilmesi).

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
- #265 ATTENDANCE session lifecycle — **merged** (PR #346, `7b9887a`), **sertleştirildi** (PR #348, `0b1586c`), **published-occurrence invariant + yayın/insert atomikliği** (PR #349, `fa4abba`) ve **not redaction + kontrollü düzeltme + `@Permissions` sözleşmesi** (PR #351, `43b6163`) ve **eşzamanlılık + transactional audit + kilitli oturumdan idempotent outbox** (PR #352, `c64d0a1`) main'de; remaining: #269 journey'inin tamamı (S5-B1/S5-B2), terminal rol verdict'leri (AC-8)
- #266 NOTIFICATION — **kısmen landed** (PR #352, `c64d0a1`): onay kapısı + atomik idempotent outbox + redakte payload main'de; remaining: relay/dispatcher (`pending→dispatched`, `sent`↔`delivered` ayrımı), bounded retry + dead-letter/manual recovery, gerçek provider entegrasyonu, redakte UI kanıtı, terminal verdict'ler
- #264 UX role-aware Turkish shell (frontend `src` absent; shell source in `frontend/app/` + `frontend/ux/`)
- #268 REPORTING quarantine
- #269 ACCEPTANCE fresh-DB UI journey — **harness landı** (PR #353, `e823ebd`): fresh DB + `src/main.ts` + gerçek tarayıcı ile 8/8 senaryo, `jobOutcomeRowsCreated=0`; iş sonucu SQL seed'i ve `page.evaluate(fetch)` statik guard ile yasaklandı, legacy yanlış-yeşil runner kabul rolünden çıkarıldı. Remaining: journey'in tamamı, negatif matris, trace/video artefaktları, post-merge canary (S5-B1/S5-B2); kabul-kanıtı guard'ı #355 (`3b75acc`) ile main'de yeşil (allowlist beyanı, guard semantiği korunarak)
- #259 SECURITY — **kod tarafı landed** (PR #352, `c64d0a1`): fail-closed secrets + tamper-evident audit zinciri + retention + tenant-scoped sorgu; remaining: terminal bağımsız verdict'ler (AC-8), tracker AC listesi işaretsiz

## Closure rule
A tracker is merge-ready ONLY when every P0/P1 row above has `runtime` or
`pilot-ready` classification with immutable evidence (HEAD SHA + test path + CI URL).
Current state: **NOT merge-ready** (main `15c5ab8`). Gerekçe:
- `planning-only`: Reporting/eokul (M7) — runtime iddiaları karantinada (#268).
- `internal`: Attendance session lifecycle (M5) — invariant/atomiklik/redaction/correction/eşzamanlılık/outbox main'de (`#352` dahil), kalan AC'ler (#269 journey'inin tamamı, terminal rol verdict'leri AC-8) açık. Parent notification (M6) — kilitli oturumdan atomik idempotent outbox + onay kapısı main'de (`#352`), relay/retry/dead-letter ve gerçek provider açık. Fresh-DB UI journey (#269) — harness + ilk journey yeşil, journey'in tamamı + negatif matris açık. KVKK redaction / audit (#259) — zincir + retention + yazma-yolu redaction main'de, terminal bağımsız verdict'ler açık.
- UX (#264): rol-farkındalıklı Türkçe shell kaynağı **üretildi** — `frontend/app/` + `frontend/ux/` (+ `frontend/runtime/` build artefaktı) ve rol-farkındalıklı paneller `test/frontend-runtime/runtime-flow-a11y.spec.ts` ile doğrulanıyor. Eksik olan `frontend/src` üretim yüzeyi ile WCAG 2.1 AA durumları/kanıtı ve E2E kanıtı.
- Bloke edici açık PR yok: son merge'ler #352 (`c64d0a1`), #355 (`3b75acc`) ve #354 (`15c5ab8`); `main` required check'leri yeşil (aşağıdaki CI URL'leri). Kapanış yalnız yukarıdaki P0/P1 satırlarının kanıtlanmasına bağlı.
`runtime` veya `pilot-ready` olmayan bir P0/P1 satırı kaldığı sürece tracker kapanmaz.

## Evidence CI URLs (main HEAD 15c5ab8, last green 2026-09-23)
- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210991
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843211013
- DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210985
- Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210987
- Main Governance Audit: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843211054
- GitGuardian scan: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35843210995
- PR #355 (`#269` acceptance guard allowlist) merge öncesi head `2a26654` required checks: Backend CI `35835952443` SUCCESS; P0 browser E2E `35835952206` SUCCESS; Sprint 1 Quality Gate `35835952244` SUCCESS; DB Smoke `35835952239` SUCCESS; Gate 1 CI `35835952305` SUCCESS; PR Governance `35835952204` SUCCESS
- PR #354 (`#258` truth reconcile, head `75b3e76`; `main` `3b75acc` üzerine update-branch) required checks: Backend CI `35842385558` SUCCESS; P0 browser E2E `35842385469` SUCCESS; Sprint 1 Quality Gate `35842385406` SUCCESS; DB Smoke `35842385508` SUCCESS; Gate 1 CI `35842385480` SUCCESS; PR Governance `35842385547` SUCCESS
- Not: `main` @ `c64d0a1` (#352 merge sonrası) acceptance guard nedeniyle kısa süreli kırmızıydı (Backend CI `35826450736` FAIL); #355 onarımı sonrası `main` @ `3b75acc` yeşil.

### Previous baseline (main HEAD e823ebd, 2026-09-23)
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
