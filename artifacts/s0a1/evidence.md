# Evidence — S0-A1 (#269)

- Baz main: `43b616363a5d1d1d4cab5057e666f4e7ae3a2c1e` · PR: #353 · Kanıtlanan head: `766a1c3496418dcf4c217e866838977b5bbb8574` · Tarih: 2026-09-22
  (Bu dosyanın eklendiği commit docs-only'dir; ağaç farkı yalnız `artifacts/` altındadır —
  güncel head'in check URL'leri PR #353 gövdesindeki "CI run referansı" bölümündedir.)
- Claim: `P0 browser E2E and artifact evidence` check'i, iş sonucunu SQL ile seed eden ve UI'yi
  `page.evaluate(fetch)` ile atlayan bir script'ten ayrıldı; artık **referans-fixture-only** seed eden,
  gerçek Nest backend + gerçek tarayıcı + görünür UI kontrolleri ile çalışan fail-closed bir harness'a
  ve onu koruyan statik bir guard'a bağlı.
- Classification: `runtime` (hedef) — **CI run URL'leri olmadan beyan edilmez.**

## Yanlış-yeşilin kanıtı (before)
`scripts/qa-p0-browser-e2e.js` (kaldırılan acceptance rolü):
- L430 `INSERT INTO schedule_events`, L442/447 `INSERT INTO leave_requests (decision_status='approved')`
  → iş sonucu SQL ile üretiliyordu (#269 AC-1 ihlali).
- L510–514 `page.evaluate(async () => fetch('/api/v1…'))`; L752–797 assignment create/clear/queue bu
  yolla yürütülüyordu → UI atlanıyordu (#269 AC-2 ihlali).
- Buna rağmen PR #352'de ilgili check `SUCCESS` idi → **yanlış-yeşil**.

## Doğrulama (yerel)
| # | Doğrulama | Komut / yol | Sonuç | Artefakt |
|---|---|---|---|---|
| 1 | Lint (src) | `tsc -p tsconfig.json --noEmit` | PASS — 0 diagnostic | — |
| 2 | Unit | `jest --runInBand src` | PASS 59/59 suite · 499/499 test | — |
| 3 | RBAC | `jest --runInBand test/rbac` | PASS 7/7 suite · 87/87 test | — |
| 4 | KVKK | `jest --runInBand test/kvkk` | PASS 9/9 suite · 43/43 test | — |
| 5 | Audit/redaction | `jest --runInBand test/kvkk/audit-redaction.spec.ts` | PASS 1/1 suite · 2/2 test | — |
| 6 | Statik guard | `jest --config ./test/jest-acceptance-guard.json` | PASS 1/1 suite · 9/9 test | — |
| 7 | Guard (Backend CI yolu) | `jest --runInBand test/acceptance-guard` (root `jest.config.js`) | PASS 1/1 suite · 9/9 test | — |
| 8 | E2E tip güvenliği | `tsc --noEmit --strict` (8 harness dosyası) | PASS — exit 0 | — |
| 9 | Build | `npm run build` (tsc + `build:runtime`) | PASS — TSC_EXIT=0, RUNTIME_ASSETS_EXIT=0 | `dist/runtime` |
| 10 | Fresh-DB journey | `npm run test:e2e` | **CI'ya bırakıldı** (bu ortamda PostgreSQL/Docker yok) | CI artefacts |

> 1–9 numaralı adımlar bu dilimin değiştirdiği yüzeyi kapsar. 10 numara, workflow içindeki
> `postgres:16` service ile çalışır; sonucu §CI bölümünde run URL'i ile bağlanır.

## Negatif matris (fail-closed kanıtı)
| Senaryo | Uygulama | Gözlenen |
|---|---|---|
| Kasıtlı ihlal: iş sonucu INSERT | `test/e2e/` altına geçici probe dosyası | Guard **EXIT=1**, `rule=job-outcome-write`; probe temizlendi |
| Kasıtlı ihlal: `page.evaluate(fetch)` | sentetik kaynak (spec içi) | `rule=page-evaluate-network` |
| Kasıtlı ihlal: DOM imalatı (`innerHTML`) | sentetik kaynak (spec içi) | `rule=page-evaluate-dom-write` |
| Referans olmayan tabloya yazım | sentetik kaynak (spec içi) | `rule=harness-write-not-reference` |
| Yorum içine gizlenmiş ihlal | sentetik kaynak (spec içi) | **bulgu yok** (yorumlar nötralize edilir) |
| DB yok / env eksik | `npm run test:e2e` (yerel) | **FAIL closed**: `E2eEnvironmentError` — skip/neutral/yeşil YOK |
| Legacy dosya workflow'a geri bağlanırsa | `workflowReferences()` | FAIL (istisna yalnız CI dışıyken geçerli) |

## Kabul kriterleri eşlemesi
| AC | Durum | Kanıt |
|---|---|---|
| S0-A1-1: fresh DB + gerçek backend ile ≥1 e2e-spec PASS | CI bekliyor | `test/e2e/runtime-shell-auth.e2e-spec.ts` + CI run URL |
| S0-A1-2: kasıtlı ihlalde guard FAIL | **PASS** | negatif matris satır 1 + spec içi sentetik negatifler |
| S0-A1-3: iş sonucu SQL seed yok | **PASS** | guard 9/9 + `test/` ve `scripts/` ihlal taraması |
| S0-A1-4: `build` yeşil, `ci:sprint1` yeşil | build PASS; `ci:sprint1` CI'da | #9 + CI run URL |
| #269 AC-1 (reference fixtures only) | **PASS (statik + çalışma zamanı)** | `reference-fixtures.ts` allowlist + `jobOutcomeRowsBefore == After` sayımı |
| #269 AC-2 (görünür UI, fetch yok, DOM imalatı yok) | **PASS** | gerçek klavye/tıklama + guard R3/R4 |

## Redaction beyanı
- PII/secret: **yok**. Fixture değerleri sentetik (`ops.s0a1@qa.invalid`, `teacher.s0a1@qa.invalid`);
  parola yalnız env'den (`E2E_SYNTHETIC_CREDENTIAL`); depoda gömülü credential literalı yok.
- Screenshot maskeli: **evet** — her ekran görüntüsünden önce `#email`/`#password` gerçek klavye
  etkileşimiyle temizlenir (`maskCredentialInputs`; DOM enjeksiyonu yok).
- Log/artefakt taraması: `scanTextForLeaks()` DOM metni + rapor üzerinde JWT/Bearer/ham backend
  detayı/telefon/sentetik olmayan e-posta arar; spec bunu boş dizi bekleyerek doğrular.
- `report.json` yalnız kimlikler, tablo adları ve verdict'ler içerir; e-posta/parola/token yazılmaz.

## Rollback
1. `test/e2e/`, `test/acceptance-guard/`, `test/jest-acceptance-guard.json` ve `test:e2e:guard`
   script'i kaldırılır.
2. `.github/workflows/wp07f-p0-browser-e2e.yml` legacy adıma döndürülür (kayıtlı gerekçe ile).
3. `scripts/qa-p0-browser-e2e.js` içindeki `ACCEPTANCE-EVIDENCE-EXCLUDED` işareti revert edilir.
4. `test/jest-e2e.json` önceki hâline döner.
Prova: dilim yalnız test/CI dosyalarına dokunur; `src/` altında tek satır değişmez → revert için
migration/DB etkisi yoktur (`git revert <sha>` yeterlidir).

## Açık boşluklar / residual'lar (dürüst beyan)
1. **Kapsam genişliği:** dilim +1724/−25 (13 dosya) → brief'in ~1.500 satır hedefinin üstünde.
   Tamamı test harness/support kodudur; S0-A1'in doğası gereği harness zorunludur.
2. **Rol-farkındalık:** `frontend/runtime/app.js` rol-farkındasız (yalnız sekme/panel görünürlüğü).
   Brief'teki "role-aware shell" örneği #264/S5-A1 kapsamındadır; bu dilimde uydurulmadı.
   Spec yalnız var olan sözleşmeyi doğrular.
3. **Kapsam dışı bırakılan test yüzeyi:** `test/database/leave-safety-queries.spec.ts`
   (`CREATE TEMP TABLE … ON COMMIT DROP` + o geçici tablolara INSERT) gerekçeli ve bayatlık
   kontrolü yapılan bir istisna olarak kayıtlıdır; kabul kanıtı değildir.
4. **Legacy residual:** `package.json` içindeki `db:seed:runtime-demo` hâlâ legacy script'i çağırır.
   Kabul check'ine bağlı olmadığı için FAIL değildir; S0-A2 kapsamında ele alınmalıdır.
5. **#269 journey'inin tamamı** (schedule→leave→approval→impact→assignment→attendance→notification)
   bu dilimin kapsamı dışındadır (S5-B1/S5-B2).
6. **Ortam:** bu makinede PostgreSQL/Docker yok; fresh-DB kanıtı yalnız CI'dan gelir. Ayrıca ilk
   `npm ci` denemesi kesildiği için `node_modules` eksik kaldı (`typeorm/.../UpdateDateColumn.d.ts`
   yoktu → yanlış TS2724 hataları). Temiz `npm ci` sonrası lint 0 diagnostic.

## Verdict'ler (exact head SHA)
| Rol | Karar | Dayanak |
|---|---|---|
| Architecture | GO (koşullu) | Harness tek sorumlulukla ayrıldı; legacy script kabul rolünden çıkarıldı; `src/` değişmedi |
| Security | GO (koşullu) | Guard fail-closed; istisnalar gerekçeli + bayatlık kontrollü; CI'a bağlanma yasağı testle zorlanıyor |
| KVKK | GO (koşullu) | Sentetik fixture, maskeli screenshot, sızıntı taraması; ham PII/secret yok |
| Data/DB | GO (koşullu) | Şema/migration yok; seeder referans-only ve `assertReferenceWrite` ile kilitli |
| QA/Acceptance | HOLD → GO | Fresh-DB journey kanıtı CI run URL'ine bağlanana kadar HOLD |

## CI (head `766a1c3496418dcf4c217e866838977b5bbb8574` — tümü `success`)
| Check | Sonuç | Run URL |
|---|---|---|
| WP-07F P0 Browser E2E | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765140 |
| Backend CI | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765060 |
| Sprint 1 Quality Gate | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765250 |
| DB Smoke | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765151 |
| Gate 1 CI | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765120 |
| Sensitive Pattern Scanner | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765243 |
| GitGuardian scan | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765077 |
| PR Governance | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765154 |
| Room Migration Cycle | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765214 |
| TeacherCourse Eligibility Cycle | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765143 |
| Identity Teacher Reference Cycle | success | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780765169 |

### Harness artefaktı (`report.json`, aynı head)
- `verdict`: **PASS** · `browserStrategy`: `sparticuz` · 7/7 senaryo PASS (health, shell fail-safe,
  gerçek UI login, sekme/panel görünürlüğü, token/PII sızıntı yok, hatalı giriş fail-closed,
  reference-only).
- `referenceOnlyFixtures.jobOutcomeRowsBefore == jobOutcomeRowsAfter` →
  `leave_requests=0, leave_substitution_assignments=0, schedule_events=0, attendance_records=0,
  notification_logs=0, leave_outbox_events=0`; **üretilen iş sonucu satırı = 0** (#269 AC-1 kanıtı).
- `leakScan.domText`: `[]` (JWT/Bearer/ham backend detayı/telefon/sentetik olmayan e-posta yok).
- Artefaktlar: `report.json`, `backend.log`, `screenshots/01-runtime-shell-initial.png`,
  `screenshots/02-shell-authenticated.png`, `screenshots/03-tab-visibility-contract.png`,
  `screenshots/04-login-failure-non-enumerating.png` (kimlik alanları temizlenerek alınmıştır).

### İlk CI koşusu (RCA kaydı, head `525752b`)
`WP-07F P0 Browser E2E` **failure**: yalnız "hatalı kimlik bilgisi" senaryosu kırıldı; ikinci
`/runtime/` ziyareti tarayıcı HTTP cache'inden **304 Not Modified** döndü (log: `Expected: 200 /
Received: 304`), diğer 6 senaryo PASS idi. Düzeltme: `page.setCacheEnabled(false)` + deterministik
akış teardown'ı (`Jest did not exit` açık handle uyarısı giderildi). İddia gevşetilmedi; yalnız hata
mesajı gözlenen durumu raporlayacak şekilde netleştirildi. Run:
https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35780411431


