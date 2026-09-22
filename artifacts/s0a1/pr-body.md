## Amaç

`P0 browser E2E and artifact evidence` check'i, iş sonucunu SQL ile üretip kullanıcı yolunu
`page.evaluate(fetch)` ile atlayan bir script'e dayanıyordu; bu yüzden hiçbir doğrulama yapmadan
"yeşil" görünüyordu (yanlış-yeşil). Bu PR, kabul kanıtını **referans-fixture-only** seed eden,
gerçek Nest backend (`src/main.ts`) + gerçek PostgreSQL + gerçek tarayıcı ile **görünür UI
kontrollerinden** çalışan fail-closed bir harness'a taşır ve bu sözleşmeyi ihlal eden kodu CI'da
yakalayan statik bir guard ekler. Sonuç: pilot kabulü artık atlanabilir bir kontrolle değil,
kanıtla bağlanıyor.

## Kapsam
- `test/e2e/` — jest harness: `support/env.ts` (fail-closed ortam sözleşmesi), `support/browser.ts`
  (puppeteer-core + `@sparticuz/chromium`, gerçek klavye/tıklama; `page.evaluate(fetch)` yok),
  `support/reference-fixtures.ts` (yalnız tenant/branch/user/rol/öğretmen/ders/oda/grup/time-slot),
  `support/runtime-server.ts` (`src/main.ts`'i başlatır, `/api/v1/health` yeşil olana kadar bekler),
  `support/pg-client.ts`, `support/acceptance-tables.ts`.
- `test/e2e/runtime-shell-auth.e2e-spec.ts` — gerçek UI login (başarı + hatalı), oturum durumu,
  sekme/panel görünürlüğü, token/PII sızıntı negatifleri, "iş sonucu satırı üretilmedi" sayımı.
- `test/acceptance-guard/acceptance-evidence.guard.spec.ts` — `test/` + `scripts/` statik guard
  (iş sonucu INSERT/UPDATE/COPY, `page.evaluate` içinde fetch/XHR, DOM imalatı, referans dışı yazım).
- `test/jest-e2e.json`, `test/jest-acceptance-guard.json`, `package.json` (`test:e2e:guard`).
- `.github/workflows/wp07f-p0-browser-e2e.yml` — legacy runner adımı kaldırıldı, yerine guard +
  gerçek harness; `if-no-files-found: error` korundu.
- `scripts/qa-p0-browser-e2e.js` — yalnız `ACCEPTANCE-EVIDENCE-EXCLUDED` işareti (S0-A2 mekanizması).
- `artifacts/s0a1/evidence.md` — §9 kanıt raporu.

## Kapsam dışı
- İş mantığı ve `src/` değişikliği (bu dilimde tek satır `src/` değişmez; şema/migration yok).
- #269 journey'inin tamamı (schedule→leave→approval→impact→assignment→attendance→notification) → S5-B1/S5-B2.
- Rol-farkındalıklı shell (frontend'te henüz yok) → #264 / S5-A1.
- Playwright geçişi ve yeni production bağımlılığı (yeni bağımlılık EKLENMEDİ).

## Acceptance criteria
- [ ] Fresh DB + gerçek backend ile en az bir `e2e-spec` PASS → kanıt: `npm run test:e2e` CI run URL (workflow `postgres:16` service)
- [ ] Kasıtlı eklenen ihlalde statik guard FAIL veriyor → kanıt: `test/acceptance-guard/acceptance-evidence.guard.spec.ts` negatif testleri + geçici probe ile EXIT=1 gözlemi
- [ ] İş sonucu SQL seed yok (yalnız referans fixture) → kanıt: guard 9/9 PASS + `test/` ve `scripts/` taramasında istisnasız ihlal kalmaması
- [ ] `page.evaluate(fetch)` / DOM imalatı yasak → kanıt: guard R3/R4 negatif testleri + harness'ta yalnız gerçek UI kontrolleri
- [ ] Env eksikse harness fail-closed (skip/neutral/yeşil yok) → kanıt: DB'siz çalıştırmada `E2eEnvironmentError`
- [ ] `npm run lint`, `test:unit`, `test:rbac`, `test:kvkk`, `test:audit-redaction`, `build` yeşil → kanıt: yerel çıktılar + CI run URL

## Test çıktısı
| Komut | Sonuç |
|---|---|
| `tsc -p tsconfig.json --noEmit` (lint) | PASS — 0 diagnostic |
| `jest --runInBand src` (test:unit) | PASS — 59/59 suite, 499/499 test |
| `jest --runInBand test/rbac` (test:rbac) | PASS — 7/7 suite, 87/87 test |
| `jest --runInBand test/kvkk` (test:kvkk) | PASS — 9/9 suite, 43/43 test |
| `jest --runInBand test/kvkk/audit-redaction.spec.ts` | PASS — 1/1 suite, 2/2 test |
| `jest --config ./test/jest-acceptance-guard.json` (test:e2e:guard) | PASS — 9/9 test |
| `jest --runInBand test/acceptance-guard` (root config = Backend CI `npm test`) | PASS — 9/9 test |
| `tsc --noEmit --strict` (8 harness dosyası) | PASS — exit 0 |
| `npm run build` | PASS — TSC_EXIT=0, RUNTIME_ASSETS_EXIT=0 |
| Guard negatif kanıt (kasıtlı probe) | FAIL — EXIT=1, `rule=job-outcome-write` (beklenen) |
| `npm run test:e2e` (yerel, DB yok) | FAIL closed — `E2eEnvironmentError` (beklenen) |
| `npm run test:e2e` (CI, fresh DB) | CI'da çalışacak — run URL aşağıda |

## KVKK / audit etkisi
İşlenen veri yalnız **sentetik referans fixture**'dır (`ops.s0a1@qa.invalid`, `teacher.s0a1@qa.invalid`,
env'den gelen sentetik parola); gerçek kişisel veri (öğrenci/veli iletişimi, sağlık/rehberlik notu)
işlenmez ve yazılmaz. Acceptance kapsamında yeni audit kaydı üretilmez, audit tabloları seed edilmez.
Artefakt redaksiyonu: ekran görüntülerinden önce `#email`/`#password` gerçek klavye etkileşimiyle
temizlenir; `scanTextForLeaks()` DOM metnini JWT/Bearer/ham backend detayı/telefon/sentetik olmayan
e-posta için tarar ve spec bunu boş dizi bekleyerek doğrular. Log/artefaktta ham PII veya secret yoktur.

## Rollback
Dilim yalnız test/CI dosyalarına dokunur; `src/` ve şema değişmez, migration yoktur. Geri alma:
1. `git revert <merge-sha>` — `test/e2e/`, `test/acceptance-guard/`, guard config'i ve `test:e2e:guard`
   script'i kalkar.
2. Gerekirse workflow tek başına revert edilir; legacy adım geri gelirse guard'ın "işaretli dosya
   workflow'a bağlanamaz" kuralı FAIL verir (kayıtlı gerekçe gerekir).
3. `scripts/qa-p0-browser-e2e.js` işaret satırı ve `test/jest-e2e.json` değişikliği revert edilir.
Prova: DB/migration etkisi olmadığı için geri dönüş veri kaybı riski taşımaz.

## CI run referansı
`<draft aşaması: CI run URL'leri yeşil olduktan sonra bu bölüme yazılacak; ready_for_review öncesi doldurulur>`

## Kalite / governance notları
- Issue reference: Refs #269
- İzole dilim: 14 dosya, +~1.8k/−25 satır (çoğunluğu test harness'ı; brief'in ~1.5k hedefinin üstünde — beyan edildi)
- Bypass kullanılmadı. `main`'e doğrudan push yok. Auto-merge kapalı; merge insan onayıyla.
- Legacy istisnası yalnız dosya içi `ACCEPTANCE-EVIDENCE-EXCLUDED` işaretiyle verilir ve testle zorlanır.
