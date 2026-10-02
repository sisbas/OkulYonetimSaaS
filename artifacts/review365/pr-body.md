## Amaç

Milestone mutabakatındaki eksik #339 kabul kanıtını ve çelişkili M7 tarih gerekçesini düzeltmek.
Current PR head: `{{HEAD}}`. Kaynak main: `9bd8d5dc333cdfe575e2500ff6e2828673edcc84`.

## Kapsam

- `docs/phase2/milestone-issue-reconciliation.md`: #339 **AÇIK / BLOCKED**; 12 AC kaynak envanteri tam ürün kabulü değildir. Architecture, Security, KVKK, Data/DB, QA gerçek exact-head verdict'leri eksik; A7 veya merged PR/CI alt kümesi yerine geçmez.
- Live ruleset: 10 context tam isimleri; formal approvals=0, bağımsız specialist review ayrı gereksinim. Toplam PASS sayısından tam-set SUCCESS çıkarımı kaldırıldı.
- M7: #264/#269 F2, #268 R12 **F3**. v2 tarihini başlangıç varsayarak +8 hafta = 2026-11-18 **owner önerisi**; v1 2026-12-04 ve yanlış milestone number=7 kaynağı açıkça karşılaştırıldı. M7 live number=8.
- Sekiz mevcut due date PATCH + yeni tarihli milestone önerileri 8/8→9/9→10/10 aritmetiğiyle doğrulandı; hiçbir komut uygulanmadı.
- `artifacts/review365/verify-docs.cjs`: salt-okunur scope/source/API guard + üç negatif mutasyon; body şablonu HEAD/CI alanları yayın sırasında doldurulur.

## Kapsam dışı

Issue closure; milestone/due date/assignment uygulaması; specialist verdict üretimi; runtime veya governance policy değişikliği; merge.

## Acceptance criteria

- [x] #339 kapanabilir iddiası kaldırıldı; named specialist verdict eksikleri ve AC-11 BLOCKED kaydedildi.
- [x] Tam 10 context ve 0 formal approvals live ruleset ile doğrulandı; independent review ayrı tutuldu.
- [x] M7 F3/R12 plan gerekçesi ve 8/8 KPI komut aritmetiği kaynak guard ile doğrulandı.
- [x] Scope/source assertions ve acceptance guard 11/11 PASS; issue/milestone değişikliği uygulanmadı.
- [ ] H6 owner tarih ve milestone kararları.
- [ ] #339 exact-head specialist verdict'leri, tam CI/observation ve ürün kabulü (ayrı dilim).
- [ ] Bağımsız exact-head docs review / H3 ve POLICY_DEADLOCK #368 owner kararı.

## Test çıktısı

- Planning-only scope guard: PASS — `node artifacts/review365/verify-docs.cjs`; live ruleset, #339 açık / 12 unchecked AC, main'de eksik verdict artifact, F3/R12, M7 API number, sekiz due date + iki creation ve OPEN #368; üç negatif mutasyon reddedildi.
- Changed files: `docs/phase2/milestone-issue-reconciliation.md`, `artifacts/review365/{verify-docs.cjs,pr-body.md}`.
- Runtime code: none. Migration: none. Ruleset change: none.
- `npm ci`: PASS (600 packages; exit 0).
- `npm run test:e2e:guard -- --runInBand`: PASS, 1 suite / 11 tests.
- `npm run lint`: PASS (`tsc --noEmit`, exit 0).
- `npm test -- --runInBand`: exit 0; 112 suites / 1002 tests PASS, **9 suites / 37 tests skipped**. Live asset probes ayrıca erken SKIP döndü; production/DB kabulü sayılmadı.
- İlk docs guard CRLF satır sonu yüzünden FAIL: input LF normalize edilerek düzeltildi, guard tekrar PASS. İlk geniş test tool timeout (120s), PASS sayılmadı; 600s bütçeli tekrar 185.586s'de tamamlandı.
- Kanıt yalnız docs dilimine aittir; tüm ürün AC'leri veya #368 için kabul değildir.

## KVKK/audit etkisi

Kişisel veri/secret değeri işlenmedi. Yalnız issue, kaynak SHA, plan/ruleset ve test meta-verisi. Audit runtime wiring #367 / PR #366 önkoşulu açık kaldı; veri veya erişim değişikliği yok.

## Rollback

`git revert <bu-PR-merge-sha>`; yalnız mutabakat belgesi ve verification artifacts geri alınır. Uzak issue/milestone değişikliği yapılmadı.

## CI run referansı

{{CI}}

## Issue reference

Refs #345 #258 #339 #367 #368.

## İnsan kapısı / PR durumu

Draft. **POLICY_DEADLOCK #368 OPEN**: main `progress-v2.md:46–47` AFTER merge resolve,
live ruleset 19052349 BEFORE merge resolve ister. Policy yeniden yazılmadı ve bu çalışmada thread resolve edilmedi.
İlk API gözleminde mevcut 4 thread zaten resolved idi (unresolved=0); bu state kabul/owner kararını kanıtlamaz.
