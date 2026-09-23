# feat(kvkk,notifications): versioned withdrawable consent lifecycle with consent_version trace (Refs #266)

> **Durum:** PR **açılmadı** (talimat: yalnız A7 GO + ORCH onayından sonra). Bu dosya hazır PR
> gövdesidir; açılışta `gh pr create --base main --head p1b/notification-consent-versioned
> --body-file artifacts/R5/pr-body.md`. **Sıralama notu:** bu dalın geçmişi PARÇA 1
> (`p1b/audit-kvkk-redaction` @ `443d366`) commit'lerini içerir; PR açılmadan önce ORCH
> kararıyla rebase edilmeli veya base `p1b/audit-kvkk-redaction` seçilmelidir (tek PR = tek amaç).

## Amaç

#266'nın ikinci yarısı: KVKK onayını **granüler + sürümlü + geri çekilebilir** hale getirmek ve
bildirim kararının hangi onay sürümüne dayandığını **izlenebilir** kılmak. Bugüne kadar onay
kapısı satır bazlıydı (`status='approved'` olan herhangi bir satır kanalı açıyordu): geri çekme
yeni bir satırla temsil edildiğinde eski onaylı satır kanalı açık tutabiliyordu. Ayrıca onay
durumu okunurken (hassas okuma) ham iletişim verisinin yanıta/audit'e sızmasını engelleyen
ikinci bir savunma katmanı yoktu ve öğretmen rolünün bu yüzeye erişemediği test edilmiyordu.

## Kapsam

- `src/kvkk/consent-versioning.ts` (yeni): tip+kanal bazlı onay kararı; her tipin **en yüksek
  `version`** satırı yönetir; geri çekme/süre dolması/çelişki/bozuk sürüm → fail-closed.
  `consentVersion` izi = kararı veren kapının yöneten sürümü.
- `src/kvkk/consent-lifecycle.service.ts` (yeni): hassas okuma (yalnız maskeli iletişim + yaşam
  döngüsü durumu + kanal kararları, durable audit `dataprotection.export.redacted` +
  `redactionReceipt`) ve **geri çekme** (yöneten sürümü koşullu `UPDATE` ile `revoked`,
  `kvkk_consent_events` olayı ve audit `dataprotection.consent.revoked` **aynı transaction'da**;
  eşzamanlı ikinci çağrı `no_change`).
- `src/kvkk/contact-masking.ts` (yeni): okuma yolunda ikinci maskeleme katmanı
  (`remaskedFields` ile denetlenebilir kanıt) — ham telefon/e-posta yanıta girmez.
- `src/kvkk/consent-audit-reference.ts` (yeni): hassas okuma audit'inin `entityId`'si ham öğrenci
  UUID'si değil, ondan türetilen deterministik/kiracıya kilitli referanstır.
- `src/notifications/notification-consent.controller.ts` (yeni): `GET
  /api/v1/notifications/consents/:studentId` (`student:kvkk:read`) +
  `POST .../:studentId/withdraw` (`parent_notification:approve`); kiracı **yalnız** sunucu
  context'inden; her route'ta `@Permissions` (global guard metadata yoksa fail-open).
- `src/notifications/absence-notification.service.ts`: onay kararı sürüm bazlı; outbox satırına
  `consent_version` yazılır (izlenebilirlik AC'si).
- `src/database/migrations/1835000000000-AddKvkkConsentVersioning.ts` (yeni, DDL):
  `kvkk_consents.version integer NOT NULL DEFAULT 1` + `CHECK (version >= 1)` +
  `(tenant_id, subject_id, consent_type, version DESC)` index; `down()` idempotent.
- `src/notifications/notifications.module.ts`: consent controller + servis + transactional audit
  writer kaydı.
- Testler: `src/kvkk/consent-versioning.spec.ts`, `src/kvkk/consent-lifecycle.service.spec.ts`,
  `src/notifications/notification-consent.controller.spec.ts`, `test/database/kvkk-consent-versioning.migration.spec.ts`
  (+ `absence-notification.service.spec.ts` güncellendi).
- `docs/notifications/absence-outbox.md`: `consent_version` sözleşmesi + onay yaşam döngüsü yüzeyi.

## Kapsam dışı

- R6 relay/dispatch worker (kuyruk, backoff, dead-letter, `notification.sent/failed` audit).
- R7 bildirim taslağı yüzeyi ve UI payı (A5), gerçek SMS/e-posta/WhatsApp sağlayıcısı (K2: sahte provider).
- Onay **verme** (grant) yüzeyi ve süresi dolmuş satırların toplu damgalanması/retention.
- `src/rbac/**`, `src/database/seeds/**` (A2) — gerekli izinler seed'de zaten mevcut, **değiştirilmedi**.
- `src/app.module.ts`, `package.json`, `src/database/data-source.ts` (ORCH) — **dokunulmadı**.

## Acceptance criteria

- [x] Consent geri çekilince kanal **kullanılamaz**: yöneten sürüm `revoked` olduğunda aynı tipin
  eski onaylı sürümü kanalı açmaz (mutasyon kontrolüyle kanıtlandı).
- [x] Consent **versiyonu izlenebilir**: outbox satırında `consent_version` dolu
  (allowed → parent sürümü; `blocked_channel_consent` → kanal sürümü; hiç onay satırı yoksa `NULL`).
- [x] Süre (`expires_at`) ve geri çekme (`revoked_at`) yaşam döngüsü karar anında fail-closed.
- [x] Ham PII **hiçbir** log/yanıt/audit kaydında yok (okuma yolunda ikinci maskeleme + PII'siz audit `entityId`).
- [x] Teacher bu yüzeye erişemez (izin seti seed'den okunarak guard ile doğrulandı).
- [x] Tenant/BOLA negatifleri yeşil (yabancı öğrenci → boş sonuç/`not_found`, gövdedeki `tenantId` yok sayılır).
- [x] Audit, domain mutasyonuyla **aynı transaction'da**; eşzamanlı geri çekme tek geçiş üretir.
- [ ] **CI:** DB Smoke (`test:database:required`) + P0 E2E — PR açılışında eklenecek.

## Test çıktısı

```text
npx tsc -p tsconfig.json --noEmit                      -> exit=0, stdout: (0 satır)
npx jest --runInBand src/notifications src/kvkk test/kvkk test/database
  Test Suites: 8 skipped, 25 passed, 25 of 33 total
  Tests:       32 skipped, 137 passed, 169 total       (exit=0; skip = yerelde PostgreSQL kapalı)
npx jest --runInBand test/acceptance-guard             -> exit=0 (11 passed)
npx jest --runInBand src/common/audit                  -> exit=0 (223 passed)
Mutasyon (a): yöneten-sürüm kapısı kaldırıldı -> 2 suite/5 test KIRMIZI -> geri alındı
Mutasyon (b): outbox consent_version izi kaldırıldı -> 1 suite/3 test KIRMIZI -> geri alındı
Rollback provası (443d366): tsc exit=0 (boş stdout); jest 21 passed / 8 skipped, 96 passed test
```

## KVKK/audit etkisi

- **Veri minimizasyonu:** bu yüzey ham iletişim verisi döndürmez; `kvkk_consent_subjects` zaten
  yalnız maskeli değer saklar, okuma yolu **ikinci kez** maskeler (ham değer yakalanırsa
  `remaskedFields` ile raporlanır). Outbox `payload_masked` devralınan pseudonym sözleşmesini
  korur (`studentRef`/`sessionRef`); bu dilim payload'a ham alan **eklemez**.
- **Denetlenebilirlik:** hassas okuma `dataprotection.export.redacted` + `redactionReceipt`
  (redacted+skipped=evaluated değişmezi); geri çekme `dataprotection.consent.revoked` +
  `kvkk_consent_events('revoked')` **aynı transaction'da** (constitution Madde III).
- **PII'siz audit referansı:** okuma audit'inin `entityId`'si öğrenci UUID'sinden türetilen
  deterministik referanstır (anahtar olmadan geri döndürülemez, kiracıya kilitli).
- **Yeni zorunlu prod secret:** `KVKK_PSEUDONYM_KEY` (>= 32 karakter). **Deploy sırası: önce env,
  sonra kod** — yoksa süreç boot etmez (fail-closed). **H1 güncellemesi gerekir**; pseudonym
  rotasyonu eskileri geri döndürülemez kıldığı için **H5/DPO notu** gerekir.
- **RBAC:** iki route da `@Permissions` taşır; `teacher` rolü bu izinlere sahip değildir (testle sabitlendi).

## Rollback

`git revert bc2a47b` (kod). DDL: `npm run db:migrate:revert` — `down()` idempotenttir
(index → CHECK → kolon). `version` yalnız izleme alanı olduğu için geri almada veri kaybı yoktur;
`consent_version` kolonu `NULL`'a döner ve onay kapısı eski (satır bazlı) davranışa **düşmez** —
çünkü kapı kodu da revert edilir; ara durumda (kod ileri, DDL geri) yazma yolu `version` beklediği
için **önce kod, sonra DDL geri alınmalıdır**. Detay + prova: `artifacts/R5/evidence.md` §5.

## CI run referansı

**Bekliyor (PR açılmadı).** PR açılışında eklenecek: `DB Smoke` (`test:database:required`, skip
yasak — bu dilim DDL içerir) + `P0 browser E2E and artifact evidence` + `Backend CI` /
`Sensitive Pattern Scanner`. Yerelde DB suite'leri skip'tir ve **PASS sayılmadı**.

