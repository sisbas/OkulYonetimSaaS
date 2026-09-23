# A4-F1 · test(acceptance): journey/negatif matris iskeleti, artefakt head-SHA sözleşmesi ve yeni fail-closed guard kuralları (Refs #269)

> **PR yalnız A7 GO + ORCH onayıyla açılır.** Bu dosya PR gövdesidir.

## Amaç

R10 (journey'in tamamı) ve R11 (negatif matris + canary) dilimleri **ürün kodu
beklemeden** başlayabilsin diye kabul harness'ının sözleşmesini ve fail-closed
altyapısını kurmak; "iş sonucu SQL ile seed edilerek yeşil görünme" ve
"env unreachable/skip/neutral = PASS" yollarını **test edilebilir biçimde**
kapatmak.

## Kapsam

- **Journey iskeleti** (yeni): 7 adım tek yerden, sıralı, makine-okur
  (`journey-contract`); executor'ı olmayan adım `NOT_IMPLEMENTED` (**non-PASS**)
  ve açacak dilim yazılı. `SKIP` verdict'i yoktur (`verdict-policy`).
- **Negatif matris kataloğu** (yeni): 8 kategori; sınıflandırma
  `classifyNegativeOutcome` ile fail-closed (`unreachable`/404/skip/neutral/
  cancelled → PASS değil).
- **Referans-fixture genişletmesi**: ikinci şube, aday öğretmen + ders uygunluğu,
  roster öğrencileri, veli (iletişim alanları boş), `tenant_settings`.
  **İş sonucu SQL yazımı yok**; `jobOutcomeRowsCreated = 0` invariant'ı yeni
  tablolarla (`schedules`, `schedule_versions`, `daily_operation_lessons`,
  `report_runs`, `kvkk_*`) genişletildi.
- **Artefakt sözleşmesi** (yeni `artifact-manifest`): her kabul yüzeyi kendi
  dizininde manifestosunu üretir; **exact head SHA** bağı + redaksiyon
  **bulgu = 0** + kapsam denetimi; trace/video roll olarak `pending-slice` +
  gerekçe. `artifact-scan` alt ağaç dışlama ve PII desenleriyle güçlendirildi
  (credential'lı bağlantı dizesi, private key, sağlayıcı jetonu, secret env
  ataması).
- **Guard**: `R6` (skip/todo/only), `R7` (yasak verdict literali), `R8`
  (doğrudan işlemsel API çağrısı), `R9` (manifest/head bağı), `R10` (kanonik
  liste kopyası), **`R13`** (kabul yüzeyinde tablo adı literali yasak),
  **`R14`** (kabul yüzeyinde sabit commit SHA yasak), `R11` (negatif
  sınıflandırma) + `F1` sözleşme/PASS-provenance testleri. Guard 11 → **25**
  fail-closed test.
- **CI**: `wp07f-p0-browser-e2e.yml`'e "artefaktlar exact head SHA'ya bağlı ve
  redaksiyon bulgusu 0" adımı eklendi (yasak verdict etiketi taraması dahil).

## Kapsam dışı

Ürün kodu (`src/**`) **değişmedi**; migration yok; journey adım executor'ları ve
negatif senaryo executor'ları (R10/R11'e ait); trace/video artefakt üretimi ve
canary/rollback provası (R11); `docs/**` (A6); frontend (A5).

## Acceptance criteria → kanıt eşlemesi

| AC | Kanıt |
|---|---|
| 7 adım sözleşmesi + non-PASS skip yasağı | `journey-contract` + `verdict-policy`; guard `F1` testleri; spec'te adım başına `NOT_IMPLEMENTED` assert'i |
| İş sonucu SQL seed yasağı / `jobOutcomeRowsCreated = 0` | guard `R1`; spec'te seed-öncesi/sonrası DB sayımı ve `rowsCreatedBySeed() === 0` |
| `skip/neutral/cancelled/unreachable/404 ≠ PASS` | guard `R11` testi (10+ negatif girdi) + `normalizeVerdict` fail-closed |
| Artefakt head SHA + redaksiyon bulgu=0 | guard `R9` testleri; CI adımı; spec'te `verifyArtifactManifest(...) === []` |
| Guard kuralları kırmızıya döner | Mutation A (2 kırmızı), Mutation B (4 kırmızı) — `artifacts/A4-f1/evidence.md` §4 |
| Yeni tablolar invariant'a dahil | `acceptance-tables.JOB_OUTCOME_TABLES` (15 tablo) + `JOURNEY_OUTCOME_TABLES` üyelik doğrulaması |

## Test çıktısı (çalıştırıldı)

```text
npx tsc -p tsconfig.json --noEmit                    → exit 0, stdout boş, stderr boş
npx tsc -p tsconfig.e2e-typecheck.tmp.json           → exit 0, stdout boş, stderr boş   (geçici tsconfig; commit edilmez)
npm run test:e2e:guard                              → Test Suites: 1 passed · Tests: 25 passed, 25 total
npm run test:e2e                                    → exit 1 · Test Suites: 2 failed · Tests: 15 failed
                                                      hepsi: E2eEnvironmentError: DATABASE_URL is required…
                                                      (yerel: PostgreSQL kapalı → FAIL, skip değil; CI kanıtı beklenir)
```

Mutasyon kontrolü (özet — ayrıntı `artifacts/A4-f1/evidence.md` §4):

```text
Mutation A (R13+R14 devre dışı)  → Tests: 2 failed, 23 passed, 25 total
Mutation B (R10 anchor /./, head bağı off, PASS-provenance off)
                                  → Tests: 4 failed, 21 passed, 25 total
geri alındı                       → Tests: 25 passed, 25 total
```

## KVKK / audit etkisi

- Kabul testleri **iş sonucu** (onaylı izin, atama, yoklama, bildirim, rıza
  kaydı) üretmez/seed etmez; yalnız referans varlıklar kurulur → kanıtın
  gerçek kullanıcı yolundan gelmesi zorunlu kalır.
- Yeni `kvkk_consent_*` tabloları R1 kapsamına alındı: rıza kaydının SQL ile
  imal edilmesi yasak.
- Artefaktlarda PII/secret taraması **bulgu = 0** olmadan koşu geçmez; veli
  referansının iletişim alanları bilinçli olarak **boştur**; ekran görüntüsü
  öncesi kimlik alanları gerçek klavye etkileşimiyle temizlenir.
- Denetim (audit) verisi üretilmez/değiştirilmez; `audit_logs`'a test yazımı
  guard tarafından reddedilir (R2 sentinel'i).

## Rollback

`git revert <squash-sha>` (veya branch'i kapatmak) yeterlidir: ürün kodu,
migration ve veritabanı şeması değişmedi. Workflow'a eklenen adım yalnızca
doğrulayıcıdır; kaldırıldığında check seti A4-F1 öncesi hâline döner.

## CI run referansı

**Bekliyor** — PR yalnız A7 GO + ORCH onayıyla açılır. Açılışta buraya
`P0 browser E2E and artifact evidence` run URL'i + `DB Smoke` run URL'i eklenir
(§8 satır 2/3: yerel skip, CI kanıtı).

## Bilinen boşluklar

1. Journey/negatif executor kaydı **boş** → tüm adımlar `NOT_IMPLEMENTED`
   (non-PASS); R10/R11 dilimlerinde doldurulur.
2. Trace/video artefaktı `pending-slice` (R11).
3. Kapsam boyutu ~2.774 satır (hedef ~1.500 üstü; ORCH snapshot'ında devralınan
   dosya kümesi). Bölme önerisi: F1a iskelet+guard, F1b fixture+manifest+CI
   adımı — karar ORCH/A7'ye aittir.

