# Evidence — S5-B1/S5-B2 (#269)

- Baz main: `1d441da` · PR: #506 · Doğrulanan head: `20a2cf7becaf1fe5d4fee5e5fedbd33cf0c82460` · Tarih: 2026-11-01
- Claim: #269 journey'i (`schedule draft/publish → teacher leave request → manager approval → impact →
  candidate assign/clear → attendance submit/lock → notification draft`) fresh DB + gerçek Nest backend +
  gerçek Chromium üzerinde görünür UI ile yürütülür; S5-B1/S5-B2 negatif matrisi, a11y, responsive,
  aynı-origin canlı `/api/v1` 200, DB audit ve PII-redakte trace/screenshot kanıtı aynı head'e bağlanır.
- Classification: `runtime` (hedef). CI run URL'leri bu dosyada exact head ile eşleşir.

## Yerel doğrulama
| # | Doğrulama | Komut | Sonuç |
|---|---|---|---|
| 1 | Build | `npm run build` | PASS — tsc + `build:runtime`, `dist/runtime/app/tokens.css` mevcut |
| 2 | Frontend runtime | `npm run test:frontend-runtime` | PASS — 16/16 suite · 147/147 test |
| 3 | Acceptance guard | `npm run test:e2e:guard` | PASS — 1/1 suite · 12/12 test (R5 skip/todo/failing dahil) |
| 4 | E2E tip güvenliği | `tsc --noEmit --strict` (harness dosyaları) | PASS — exit 0 |
| 5 | Fresh-DB journey | `npm run test:e2e` | CI'da `postgres:16` service ile (bu makinede PostgreSQL/Docker yok) |

## CI — exact head `20a2cf7`
| Check | Sonuç | Run |
|---|---|---|
| WP-07F P0 Browser E2E | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535776 |
| Backend CI | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535844 |
| DB Smoke | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535702 |
| Sprint 1 Quality Gate | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535683 |
| Gate 1 CI | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535656 |
| Sensitive Pattern Scanner | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535750 |
| GitGuardian scan | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535703 |
| PR Governance | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535741 |
| Identity Teacher Reference Cycle | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535706 |
| TeacherCourse Eligibility Cycle | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535697 |
| Room Migration Cycle | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/41298535748 |

`Demo Frontend Smoke` ve `Full-Vision Demo Smoke` bu değişiklik yolunda path filtresiyle **skipped**;
kabul kanıtı olarak sayılmazlar (aşağıdaki "skip PASS değildir" kuralı).

## WP-07F artefaktları (`stage5-full-journey-report.json`)
- `verdict: PASS`, `headSha: 20a2cf7…`, 8/8 senaryo PASS; tümü gerçek UI/klavye/tıklama ile.
- Fresh DB seed yalnız referans fixture: `jobOutcomeRowsCreated=0`, `students=3`, `consents=6`.
- Coverage: schedule revision 2 / published v1; leave approved + covered→unresolved; attendance
  absent/present/absent + 2 outbox; notifications bulk-approved + simulated delivered receipt.
- Screenshots: 9 adet (`s5/01`–`s5/09`); credential alanları gerçek klavye ile maskelenir.
- Trace: `s5/traces/s5-journey-trace.json` (20.781.318 byte), sanitize sonrası `scanTextForLeaks = []`.
- DB audit (tenant + `startedAt`): `attendance.record.marked=4`, `attendance.session.closed=2`,
  `attendance.session.opened=2`, `dataprotection.consent.read=4`, `dataprotection.consent.revoked=2`,
  `leave.approved.v1=1`, `leave.requested.v1=1`, `leave.substitution_assigned.v1=1`,
  `leave.substitution_cleared.v1=1`, `notification.sent=2`; metadata PII taraması temiz.
- Sızıntı taraması: DOM, 88 network yanıtı, artefakt dizini (`findingCount=0`), backend log ve
  local/sessionStorage + cookie (boş) → bulgu yok.

## Negatif matris ve a11y (PASS)
| Vaka | Gözlenen |
|---|---|
| invalid date | `GET /daily-operations/today?date=2026-02-31` → HTTP 400 |
| stale/conflict | eski `If-Match` ile approve → HTTP 409; DB `decision_status=approved` değişmedi |
| forbidden | öğretmen approve → HTTP 403 |
| session expiry | gerçek imzalı, `exp` geçmiş token → HTTP 401 |
| cross-tenant | B şubesi A draft/leave → 404 (non-enumerating) |
| not found | bilinmeyen draft → HTTP 404 |
| empty | B şubesi listesi → `data-state=same_scope_empty` |
| loading | geciktirilmiş `/notifications` → `role=status` loading, sonra 3 kart |
| offline | ağ kesintisi → `data-state=offline_or_unavailable`; reconnect → veri |
| same-origin live | `/api/v1/notifications` authenticated GET → HTTP 200 |
| a11y login | axe total=0, critical/serious=0 |
| keyboard | Tab → `#email`, focus ring `solid/2px`, Enter ile login (mouse yok) |
| a11y desktop | axe total=0, critical/serious=0; yatay taşma yok |
| a11y mobile (390×844) | axe total=0, critical/serious=0; yatay taşma yok |

Bu dilimde bulunan gerçek kusurlar düzeltildi:
- `frontend/runtime/styles.css` `@import ../app/tokens.css` `/runtime` altında 404 veriyordu →
  `app/tokens.css`; aksi halde tüm `var(--…)` (focus outline dahil) geçersizdi.
- 390px'te `.tabs` sarmıyordu → `flex-wrap: wrap`; kart ayırıcı `#94a3b8` kontrastı → `#5b6680`.

## Kabul kriterleri eşlemesi
| #269 AC | Durum | Kanıt |
|---|---|---|
| AC-1 reference-only fresh DB seed | **PASS** | `jobOutcomeRowsCreated=0`; fixture allowlist + guard |
| AC-2 visible UI / public API; `page.evaluate(fetch)` ve DOM injection yok | **PASS** | 8/8 UI senaryosu; guard R3/R4/R5 |
| AC-3 live same-origin `/api/v1` authenticated 200 | **PASS** | aynı-origin live 200 + WP-07F |
| AC-4 desktop/mobile, keyboard/focus, axe critical/serious=0 | **PASS** | a11y tablosu, 390×844 + 1440×900 |
| AC-5 negative matrix (empty/loading/error/offline, invalid date, stale, forbidden, expiry, cross-tenant) | **PASS** | negatif matris tablosu |
| AC-6 trace, video/screenshots, logs, DB audit + PII redaction, exact head | **PASS (trace + screenshots)** | `s5/traces`, `s5/screenshots`, backend log, DB audit; video yok |
| AC-7 unreachable/404/skip/neutral/cancellation PASS değil | **PASS** | spec'ler fail-closed; report `verdict` yalnız PASS/FAIL |
| AC-8 post-merge reversible canary + error/SLO + rollback | **RESIDUAL** | `scripts/synthetic-canary.js` + `.github/workflows/post-merge-canary.yml` hazır; merge sonrası çalışır |
| AC-9 open P0/P1 yok, bulgular fixed/rejected | **RESIDUAL** | Bu dilimin bulguları düzeltildi; global açık P0/P1'ler #259/#266 kapsamında |
| AC-10 tüm roller terminal pre-merge verdict | **RESIDUAL** | Bağımsız review/verdict süreci PR #506 üzerinde yürür; verdict'ler `head_sha=20a2cf7`'ye bağlanmalı |

## Redaction beyanı
- Fixture'lar sentetik (`*@qa.invalid`); parola yalnız `E2E_SYNTHETIC_CREDENTIAL` env'inden gelir.
- Screenshot'larda `#email`/`#password` gerçek klavye ile temizlenir (DOM enjeksiyonu yok).
- Trace sanitizer JWT/Bearer/cookie/password/phone/PII desenlerini yazar; sonrasında
  `scanTextForLeaks` boş dizi beklenir.
- DB audit metadata ve backend log aynı taramadan geçer.

## Rollback
- `git revert 20a2cf7` (veya PR #506 revert) — migration yok, şema/veri etkisi yok.
- Canary salt-okunur; `CANARY_ENABLED` kapatılarak devre dışı bırakılabilir; veri rollback gerekmez.
- Runtime CSS düzeltmeleri yalnız görsel/erişilebilirlik; iş kuralları değişmedi.

## Residual / açık kapılar (dürüst beyan)
1. **Post-merge canary çalıştırılmadı**: `CANARY_ENABLED=true` + canary secret/base URL merge sonrası
   gerekir; sonuç `post-merge-canary` workflow run URL'i ile bu dosyaya eklenmelidir.
2. **Terminal rol verdict'leri**: PR #506 review/approval süreci tamamlanmadan AC-10 kapanmaz.
   Verdict'ler exact `head_sha=20a2cf7` üzerinden bağlanmalıdır.
3. **Video yok**: AC-6 "video/screenshots" ifadesi trace + 9 screenshot ile karşılandı; video artefaktı
   üretilmedi (zorunlu görülürse ayrı iş kalemi).
4. **Global P0/P1'ler**: #259 (terminal verdict altyapısı) ve #266 (gerçek provider) bu PR'ın kapsamı
   dışındadır; #269'un "no open P0/P1" maddesi onlar kapanmadan teknik olarak kapanmaz.
