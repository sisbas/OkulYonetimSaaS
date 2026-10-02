# Bounded checkpoint trust anchor — Refs #358 #259 #367

## Amaç

Read-side checkpoint HMAC doğrulaması: `lastCheckpoint()` artık signature
kolonunu okur, alan biçimlerini denetler, kendi key-id'sinden aktif/eski anahtarı
çözer ve constant-time HMAC karşılaştırmasını **startPrevHash kullanılmadan ve
audit_logs sorgulanmadan önce** yapar. Başarısızlık secret/DB içeriği taşımayan
hata fırlatır; doğrulanmamış checkpoint döndürülmez.

## Kapsam ve güven sınırı

- Başlangıç: main `58bad0eb6822bfc6dd42a9ab2807b2a2b8d9da91`.
- Çalışma dalı: `p1b/final-checkpoint-trust`; izole `p1b-checkpoint` worktree.
- Yalnız query service/spec, mevcut retention DB spec ve bu kanıt dokümanı.
- Üretim retention formatı: `HMAC-SHA256(key, UTF8(head_hash))`, lowercase
  64-hex. Sequence, timestamp, reason, pruned count, actor ve key-id HMAC
  gövdesinde değildir. Key-id yalnız verification key seçer.
- Sequence pozitif safe integer; head/signature 64 lowercase hex; key-id
  1..40 karakter ve boş değil; timestamp geçerli olmalıdır. Bu denetimler
  unsigned alanların geçerli başka değerlere değiştirilmesini tespit etmez.
- Sonuç her zaman `verificationScope: bounded-segment`; `valid: true` yalnız
  okunan segmentin tutarlılığıdır. `limitReached` satır sayısı limite ulaştı
  demektir; daha fazla satır bulunduğunun kesin kanıtı değildir.
- Global chain doğrulaması tenant-scoped export değildir; KVKK maskeli okuma
  sözleşmesi korunur. Yeni PII/secret metadata veya audit yazımı yoktur.

## Kapsam dışı ve tespit edilemeyen durumlar

Whole-chain/runtime/pilot PASS beyanı yoktur. DB checkpoint'i dışarıdan yayımlanmış
bağımsız trust anchor değildir. Geçerli imzalı eski checkpoint replay/deletion,
unsigned sequence/timestamp değişikliği, checkpoint ve zincirin birlikte
silinmesi veya tutarlı tail truncation bağımsız beklenen baş/sıra olmadan
genel olarak tespit edilemez. `expectedHeadHash` / `expectedLastSequence`
okunan segmentin sonuna karşı kontrol edilir; limit nedeniyle segment kesilmişse
global son başla eşleşmemesi de failure üretebilir. Ayrı sorgular atomik snapshot
değildir; concurrent retention için bütün-chain tutarlılık garantisi verilmez.

Writer-side anchor doğrulaması, retention formatı/politikası, controller/module
wiring bu dilimin dışındadır. #367 / PR #366 live sorguda OPEN, mergedAt null;
wiring commitleri bu dala alınmadı. #368 policy deadlock owner kararı bekler.

## Acceptance criteria ve Test çıktısı (2026-09-29)

| Çalıştırılan komut | Sonuç |
|---|---|
| `npm ci` | PASS; lock değişmedi; npm mevcut bağımlılıklarda 19 vulnerability bildirdi |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npx jest --runInBand src/common/audit test/kvkk test/database/audit-retention.db.spec.ts` | 18 suite / 285 test PASS; DB 1 suite / 6 test SKIP |
| `npm run test:e2e:guard -- --runInBand` | 11 test PASS; guard değişikliği/exemption gerekmedi |
| `npm test -- --runInBand` (HMAC restore sonrası) | 112 suite / 1020 test PASS; 9 suite / 38 test SKIP |
| `git diff --check` | PASS |

Unit: eksik/boş/malformed/yanlış signature, değiştirilmiş hash, eksik/unknown
key-id, unsafe/negatif/fractional sequence, invalid timestamp fail closed;
retired checkpoint + active suffix PASS; eski key kaldırılırsa failure;
unsigned alan ve unanchored empty suffix limitleri testle gösterilir.

Mutation: HMAC comparison geçici bypass edildiğinde iki negatif test
(modified signature/hash) FAIL, 23 PASS. İlk `false &&` mutation denemesi
TypeScript narrowing nedeniyle derlenmedi (davranış kanıtı sayılmadı); derlenen
`comparison && false` denemesi yukarıdaki iki FAIL'i üretti. Bypass kaldırıldı;
tam suite green. Ürün/CI repair denemesi henüz yok; üst sınır 3.

DB: mevcut retention suite gerçek prune checkpoint'ini QueryService üzerinden
doğrular; persist edilmiş hash/signature/key-id mutasyonlarını reddeder; eski
key ile checkpoint, yeni key ile suffix ve eski key kaldırma failure'ını sınar;
tail silme tespit sınırını bağımsız expected head ile gösterir. Yerel PostgreSQL
yok; SKIP acceptance değildir. CI DB Smoke `qa:db` içindeki skip-yasak
`test:database:required` gerçek PostgreSQL kanıt kaynağıdır.

## Review

Standards/spec diff incelemesi: constitution III/IV/V ve #358'e karşı kapsam
uygun; imza yalnız hash için doğrulanır, alan doğrulaması kriptografik bağlama
olarak sunulmaz. Bu harness'te Agent aracı bulunmadığından iki-axis subagent
review çalıştırılamadı; external Codex review PR comment üzerinden istenir.

## Rollback

Kod commitini revert edin; schema/data migration yok, veri silinmez. Revert
read-side trust-anchor açığını yeniden getirir; retention politikasını veya
anahtarları değiştirmek rollback değildir.

## CI run referansı

Draft PR: https://github.com/sisbas/OkulYonetimSaaS/pull/369 (base main).
Test edilen implementation SHA: `f0c6306028f99b614230c86c167d9211d821ad6f`.
Bu kanıt güncellemesi docs-only; implementation değişmez.

- DB Smoke **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627731
  PostgreSQL 16; migration/verify/seed, tenant guard 8 PASS, required database
  18 suite / 68 test PASS (skip yok), KVKK 43 PASS, build PASS. Log'da
  `PASS test/database/audit-retention.db.spec.ts` ve `QA DB smoke tests passed`
  doğrulandı. Yeni checkpoint DB testi bu suite içindedir.
- Backend CI **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627682
- Gate 1 **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627841
- Sprint 1 quality gate **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627749
- PR Governance **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627674
- Sensitive scanner **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627727
- GitGuardian **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627992
- P0 browser workflow **PASS**: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36623627700
  Bu workflow sonucu checkpoint route runtime/pilot acceptance değildir.
- Vercel deployment **FAIL**:
  https://vercel.com/sisbas-projects-d3c081cb/okulyonetimsaas/4gpoVDuJrRZB9ij758egVNqXHmch
  Deployment failure gözlendi; kök neden bu dilimde teşhis edilmedi. #363
  preview-waiver bağlamı mevcut olsa da burada PASS'e çevrilmez.
- CodeRabbit Draft nedeniyle review SKIP; external Codex review istendi:
  https://github.com/sisbas/OkulYonetimSaaS/pull/369#issuecomment-5897717551
  Evidence capture sırasında review yanıtı henüz yok.

Sonraki adım: docs-only head kontrollerini doğrula, Codex bulgularını değerlendir;
owner #368 policy kararı ve #367 / PR #366 manuel wiring merge sonrası ayrı
runtime/pilot kanıtı üretir. Draft ve bounded/partial durum korunur. CI/product
repair denemesi 0/3; Vercel/policy/wiring için kapsam dışı değişiklik yapılmadı.

## Issue reference

Refs #358 #259 #367. Otomatik issue kapatma yok.
