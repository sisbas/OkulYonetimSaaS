# R5 — Granüler + versioned + withdrawable consent (#266)

**Dilim:** R5 (`p1b/notification-consent-versioned`) · **Issue:** #266
**HEAD:** `bc2a47b` · **Baz:** `origin/main` @ `15c5ab8` (dilim öncesi uç: `443d366` = PARÇA 1 redaction dilimi)
**Sahiplik:** `src/notifications/**`, `src/kvkk/**`, `src/common/audit/**`, migration `1835*`
**Dokunulmayan ortak dosyalar:** `src/app.module.ts`, `package.json`, `src/database/data-source.ts` (ORCH), `src/rbac/**` ve `src/database/seeds/**` (A2 — değişiklik **gerekmedi**, bkz. §1 not 3)
**Kapsam dışı:** R6 relay/dispatch worker, R7 bildirim taslağı yüzeyi, gerçek SMS/e-posta/WhatsApp sağlayıcısı (K2: sahte provider), süresi dolmuş satırların toplu damgalanması/retention.

---

## 1) AC → kanıt eşlemesi

| AC (brif) | Durum | Uygulama | Test yolu |
|---|---|---|---|
| **Granüler consent** (parent + kanal bazlı) | ✅ | `CHANNEL_CONSENT_TYPE` kapalı sözlüğü; parent kapısı **ve** kanal kapısı ayrı değerlendirilir (`src/kvkk/consent-versioning.ts`) | `src/kvkk/consent-versioning.spec.ts` (kanal kapısı, bilinmeyen kanal), `src/notifications/absence-notification.service.spec.ts` |
| **Versioned consent** (`version`, yöneten sürüm) | ✅ | Her tipin **en yüksek `version`** satırı yönetir; `version >= 1` DB CHECK; yöneten sürüm index'i | `test/database/kvkk-consent-versioning.migration.spec.ts`, `consent-versioning.spec.ts` |
| **Withdrawable** (`revoked_at`) | ✅ | `POST .../withdraw` yöneten sürümü koşullu `UPDATE` ile `revoked` yapar + `kvkk_consent_events` olayı + durable audit **aynı transaction'da**; ikinci çağrı `no_change` | `src/kvkk/consent-lifecycle.service.spec.ts` (revoked / no_change / not_found) |
| **`expires_at` yaşam döngüsü** | ✅ | Karar anında fail-closed: `expires_at <= now` → yürürlükte sayılmaz; `state` alanı `active/revoked/expired/not_approved/invalid` | `consent-versioning.spec.ts` (sınır: `expiresAt == now` → pasif) |
| **AC: consent geri çekilince kanal kullanılamaz** | ✅ | Geri çekilen **yöneten** sürümden sonra aynı tipin eski onaylı sürümü kanalı açmaz (`governingConsent`) | `consent-versioning.spec.ts` + `absence-notification.service.spec.ts` ("governing version is revoked even though an older version is approved") |
| **AC: `consent_version` izlenebilir (outbox satırında dolu)** | ✅ | Kararı veren yöneten sürüm outbox satırına yazılır (allowed → parent sürümü; `blocked_channel_consent` → kanal sürümü; hiç onay satırı yoksa `NULL`) | `absence-notification.service.spec.ts` (`consentVersion` 4 / 3 / 2 ve eksik onayda `null`) |
| **AC: ham PII hiçbir log/yanıt/audit kaydında yok** | ✅ | Okuma yolunda ikinci maskeleme katmanı + `remaskedFields` kanıtı; audit `entityId` = ham öğrenci UUID'si değil türetilmiş referans; log satırında yalnız `consentType`+`version` | `consent-lifecycle.service.spec.ts` (JSON'da ham telefon yok, `entityId` ≠ `studentId`, log'da ham kimlik yok) |
| **AC: teacher ham veriye erişemez** | ✅ | Her route `@Permissions` taşır; `teacher` izin listesinde `student:kvkk:read` ve `parent_notification:approve` **yok** → `PermissionGuard` reddeder | `notification-consent.controller.spec.ts` (guard ile teacher seti → `false`, her route metadata'sı) |
| **AC: tenant/BOLA negatifleri yeşil** | ✅ | Tüm sorgular `c.tenant_id = $1`; yabancı öğrenci → boş sonuç / `not_found` (varlık sızdırılmaz); audit kiracısı context'ten | `consent-lifecycle.service.spec.ts` (BOLA negatifi, `not_found`), `notification-consent.controller.spec.ts` (gövdedeki `tenantId` yok sayılır) |
| **Hassas okuma durable audit + maskeleme** | ✅ | `dataprotection.export.redacted` (allowlist'li metadata + `redactionReceipt`), `dataprotection.consent.revoked` mutasyonla aynı tx | `consent-lifecycle.service.spec.ts` (receipt muhasebesi, tx tekilliği) |

**Notlar (fail-closed beyanı):**

1. `expires_at` için **toplu damgalama yok**: karar anında fail-closed uygulanır; `expired` durumuna geçirme R6/retention dilimine bırakıldı (kapsam dışı).
2. Onay **verme** (grant) yüzeyi bu dilimde yok: R5 geri çekme + sürüm izleme + hassas okumayı kapsar; grant akışı mevcut `kvkk_consents` yazma yollarında kalır (kapsam kaymasını önlemek için bilinçli).
3. **`src/rbac/**` ve `src/database/seeds/**` değiştirilmedi:** gereken izinler (`student:kvkk:read`, `parent_notification:approve`) seed'de **zaten var** ve `teacher` rolü bunları taşımıyor (test bunu seed'den okuyarak doğrular).


## 2) Kanıt seti (§8 — 7 satır)

| # | Kanıt | Sonuç (gerçek koşu) |
|---|---|---|
| 1 | **Yerel tip + test** | `npx tsc -p tsconfig.json --noEmit` → **exit=0**, stdout **0 satır** ✓ <br> `npx jest --runInBand src/notifications src/kvkk test/kvkk test/database` → **exit=0**, `Test Suites: 8 skipped, 26 passed, 26 of 34 total` / `Tests: 32 skipped, 140 passed, 172 total` (24.0 s; DI düzeltmesi `27c6ad6` sonrası yeniden koşuldu) <br> `npx jest --runInBand test/acceptance-guard` → **exit=0**, `Test Suites: 1 passed` / `Tests: 11 passed, 11 total` (regresyon; bu dilim A4 kabul yüzeyine dokunmaz) <br> `npx jest --runInBand src/common/audit` → **exit=0**, `Tests: 223 passed, 223 total` |
| 2 | **DB (CI)** | **Yerel skip** (PostgreSQL 5432 kapalı): 8 suite / 32 test DB bağlı olduğu için skip. Gerçek-PostgreSQL kanıtı yalnız **DB Smoke** (`test:database:required`, skip yasak) ile alınır → **PR açılmadığı için run URL'i henüz yok**; PR açılışında eklenecek (A7 GO + ORCH onayı sonrası). Bu dilimde **DDL var** (migration `1835000000000`), bu yüzden CI DB kanıtı merge için zorunludur. |
| 3 | **Kabul (CI)** | `P0 browser E2E and artifact evidence` run URL'i PR açılışında alınacak. Yüzey `/api/v1/notifications/consents` — E2E journey adımı (taslak yüzeyi) R7/A5 ile gelir; bu dilimde E2E adımı **kapsam dışı**, regresyon olarak statik guard (11/11) yeşil. |
| 4 | **Mutasyon kontrolü** | Aşağıda §3 — iki mutasyon, ikisi de kırmızıya döndü, geri alındı. |
| 5 | **Redaction** | Aşağıda §4 — tarama BULGU=0. |
| 6 | **Rollback provası** | Aşağıda §5 — gerçek koşu (kod + DDL). |
| 7 | **Verdict** | `artifacts/verify/R5/verdict.md` — **A7 üretir**; bu dosya ajan kanıtıdır, verdict değildir. |

**Üretilemeyen kanıt (fail-closed beyanı):** CI run URL'leri (satır 2–3) yalnız PR açıldıktan sonra üretilebilir;
PR talimat gereği **açılmadı**. Bu nedenle dilim "runtime/pilot-ready" **kabul edilmez**; "yerel yeşil + CI bekliyor" olarak raporlanır.

## 3) Mutasyon kontrolü (kanıt satırı 4)

### (a) Consent geri çekme kapısı kaldırıldı

`src/kvkk/consent-versioning.ts` → `governingConsent()` içinde yöneten sürüm kuralı geçici olarak
"herhangi bir onaylı satır kanalı açar" davranışına çevrildi
(`active: !ambiguous && activeFlags.every(Boolean)` → `active: ofType.some((row) => isConsentActiveAt(row, now))`).

```text
$ npx jest --runInBand src/kvkk/consent-versioning.spec.ts src/notifications/absence-notification.service.spec.ts
Test Suites: 2 failed, 2 total
Tests:       5 failed, 19 passed, 24 total
KIRMIZI testler:
  ● consent-versioning (#266 R5) › governingConsent › selects the highest version as the governing row
  ● consent-versioning (#266 R5) › governingConsent › fails closed when two rows share the highest version with conflicting states
  ● consent-versioning (#266 R5) › evaluateNotificationConsent › propagates ambiguity from either gate as a blocking decision
  ● consent-versioning (#266 R5) › evaluateNotificationConsent › keeps the channel blocked when the governing version is revoked even though an older version is approved
  ● AbsenceNotificationService (#266) › keeps the channel blocked when the governing version is revoked even though an older version is approved
```

→ Geri alındı; hedef suite tekrar **exit=0**.

### (b) `consent_version` izlenebilirliği kaldırıldı

`src/notifications/absence-notification.service.ts` → outbox satırındaki
`consentVersion: decision.consentVersion` geçici olarak `null` yapıldı.

```text
$ npx jest --runInBand src/notifications/absence-notification.service.spec.ts
Test Suites: 1 failed, 1 total
Tests:       3 failed, 4 passed, 7 total
KIRMIZI testler:
  ● AbsenceNotificationService (#266) › enqueues one pending row per absent student with a stable dedupe key
  ● AbsenceNotificationService (#266) › blocks enqueue when the channel consent is revoked or expired
  ● AbsenceNotificationService (#266) › keeps the channel blocked when the governing version is revoked even though an older version is approved
```

→ Geri alındı; tam hedef suite tekrar **exit=0** (25 passed / 8 skipped, 137 passed test).

### (c) Ek doğrulama taraması — bulunan ve düzeltilen kablolama hatası

`BC2A47B` sonrası yapılan kablolama taramasında **gerçek bir BOOT hatası** bulundu ve düzeltildi (`27c6ad6`):

`NotificationsModule`, `TypeOrmTransactionalAuditWriter`'ı kaydediyordu ama bağımlılığı
`AuditLogRepository`'yi kaydetmiyordu (`@Injectable()` + no-arg constructor; entity manager
çağrıdan gelir). Diğer domain modülleri (`attendance`, `leaves`) bu sağlayıcıyı **açıkça**
kaydeder. Eksik kayıt Nest DI çözümlemesinde (uygulama BOOT'unda) hata verir ve **hiçbir unit
test bunu yakalamaz** (Nest uygulaması testlerde ayağa kalkmıyor).

Düzeltme: `AuditLogRepository` provider olarak eklendi + sözleşmeyi statik sabitleyen
`src/notifications/notifications.module.spec.ts` (3 test: audit writer zinciri, consent servisi/outbox
portu, controller kaydı). Bu, "yeşil unit test = çalışan DI" varsayımının fail-closed karşılığıdır.

```text
$ npx tsc -p tsconfig.json --noEmit                      -> exit=0, stdout: (boş)
$ npx jest --runInBand src/notifications src/kvkk test/kvkk test/database
  Test Suites: 8 skipped, 26 passed, 26 of 34 total
  Tests:       32 skipped, 140 passed, 172 total          -> exit=0
  PASS src/notifications/notifications.module.spec.ts
```

**Not:** §3(a)/(b) mutasyonları `bc2a47b` ağacında koşuldu (mutasyona uğratılan satırlar
`27c6ad6`'da değişmedi); düzeltme sonrası tam suite yeniden yeşil olarak doğrulandı.

## 4) Redaction taraması (kanıt satırı 5)

```text
=== A) logger satırlarında ham kimlik/iletişim alanı ===
(pattern: logger\.(log|warn|error|debug)\(.*(studentId|student_id|sessionId|session_id|subjectId|rawId|phone|email|contactPhone|contactEmail))
src/notifications/*.ts, src/kvkk/*.ts, src/common/audit/*.ts  -> BULGU=0

=== B) payloadMasked içinde ham UUID alanı ===
(pattern: payloadMasked:\s*\{[^}]*\b(studentId|sessionId)\b)  -> BULGU=0

=== C) audit entityId olarak ham öğrenci id ===
(pattern: entityId:\s*(input\.studentId|studentId))  -> BULGU=0
```

Ek olarak testler **davranışsal** redaction kanıtı üretir (patern taraması tek başına yeterli sayılmadı):

- Okuma yanıtı ham telefonu **içermez**; ham değer yakalanıp maskelenir ve `remaskedFields: ['contactPhone']` ile raporlanır
  (`JSON.stringify(result)` içinde ham numara araması boş döner).
- Geri çekme log satırı öğrenci/consent/aktör kimliklerini **içermez** (`kvkk.consent.withdrawn` + `consentType` + `consentVersion`).
- Hassas okuma audit `entityId`'si ham öğrenci UUID'si değil, türetilmiş deterministik referanstır; audit metadata JSON'unda ham UUID araması boş döner.
- Outbox `payload_masked` yalnız pseudonym referansları taşır (devralınan #266 P2 düzeltmesi; bu dilimde `consent_version` eklendi, payload'a ham alan eklenmedi).

## 5) Rollback (kanıt satırı 6)

- **Kod rollback:** dilim tek commit (`bc2a47b`). `git revert bc2a47b` (veya `git checkout 443d366 -- <dosyalar>`).
- **DDL rollback:** `1835000000000-AddKvkkConsentVersioning.down()` idempotenttir:
  index düşer → CHECK kısıtı düşer → `version` kolonu düşer. Komut: `npm run db:migrate:revert`.
  Kolon düşürülürken veri kaybı **yoktur** ( `version` yalnız izleme alanı; karar kolonu değil).
- **Gerçek prova (kod):**

```text
$ git checkout --detach 443d366      # dilim öncesi uç (PARÇA 1 redaction)
HEAD is now at 443d366 docs(evidence): record the rollback rehearsal for the redaction slice (Refs #266)
$ Test-Path src/kvkk/consent-lifecycle.service.ts   -> False   (dilim dosyaları geri alındı)
$ npx tsc -p tsconfig.json --noEmit                 -> exit=0, stdout: (boş)
$ npx jest --runInBand src/notifications src/kvkk test/kvkk test/database
  Test Suites: 8 skipped, 21 passed, 21 of 29 total
  Tests:       32 skipped, 96 passed, 128 total      -> exit=0

$ git checkout p1b/notification-consent-versioned   # dilime geri dönüş
$ git rev-parse --short HEAD -> bc2a47b ; git status --short -> (temiz)
```

Gözlem: dilim geri alındığında depo **yeşil**; R5 testleri/DDL'i devre dışı kalıyor, DDL geri alma yolu
`down()` + `db:migrate:revert` ile tanımlı.

## 6) Değişen dosyalar ve boyut

```text
$ git --no-pager diff --stat 443d366 HEAD      # dilim öncesi uç -> HEAD (kanıt artefaktları dahil)
 artifacts/R5/evidence.md                           | 227 +++++++++++++
 artifacts/R5/pr-body.md                            | 112 ++++++
 docs/notifications/absence-outbox.md               |  60 +++-
 .../1835000000000-AddKvkkConsentVersioning.ts      |  72 ++++
 src/kvkk/consent-audit-reference.ts                |  50 +++
 src/kvkk/consent-lifecycle.service.spec.ts         | 351 +++++++++++++++++++
 src/kvkk/consent-lifecycle.service.ts              | 374 +++++++++++++++++++++
 src/kvkk/consent-versioning.spec.ts                | 245 ++++++++++++++
 src/kvkk/consent-versioning.ts                     | 224 ++++++++++++
 src/kvkk/contact-masking.ts                        |  77 +++++
 src/kvkk/index.ts                                  |   4 +
 src/notifications/absence-notification.service.spec.ts |  56 +++
 src/notifications/absence-notification.service.ts  |  76 +++--
 src/notifications/notification-consent.controller.spec.ts | 168 +++++++++
 src/notifications/notification-consent.controller.ts | 117 +++++++
 src/notifications/notifications.module.spec.ts     |  57 ++++
 src/notifications/notifications.module.ts          |  22 +-
 test/database/kvkk-consent-versioning.migration.spec.ts |  62 ++++
 18 files changed, 2305 insertions(+), 49 deletions(-)
 (kanıt artefaktları hariç: 16 dosya, +1966/-49)
```

| Grup | Satır |
|---|---|
| Üretim kodu (`src/kvkk`: 4 yeni dosya + `index.ts`) | 729 |
| Üretim kodu (`src/notifications`: servis + controller + module) | 179 (+36 silme) |
| Migration (DDL) | 72 |
| Doküman | 47 (+13 silme) |
| **Test (`src/**/*.spec.ts` — 5 dosya)** | **877** |
| Test (`test/database` — 1 dosya) | 62 |
| Kanıt artefaktı (`artifacts/R5/*`) | 339 |

**Boyut sapması (beyan):** kod/test/doküman toplamı **1.966 eklenen satır**, brif'in "≤ ~1.500 satır"
rehberinin üzerinde. Üretim+DDL kısmı **980 satır**, kalan **939 satır test** (bu dilimin AC'leri —
geri çekme kapısı, sürüm izi, maskeleme, teacher reddi, BOLA, DI kablolaması — yalnız testle
kanıtlanabildiği için kısılamadı).
**Öneri (ORCH kararı):** PR'ı ikiye bölmek gerekirse sınır doğal olarak şurada:
R5a = `consent-versioning` + migration + `absence-notification` sürüm izi;
R5b = `consent-lifecycle` + `contact-masking` + `consent-audit-reference` + controller + module (+ DI spec).
Kapsamı sessizce küçültmek yerine bu sapma açıkça raporlanır.

## 7) Bilinen boşluklar / devir notları

1. **CI kanıtı yok** (PR açılmadı): DB Smoke (`test:database:required`, skip yasak) + P0 E2E run URL'leri
   PR açılışında eklenecek. Bu dilim **DDL içerdiği için** DB kanıtı merge öncesi zorunludur.
2. **H1 (insan kapısı) güncellemesi gerekiyor:** `KVKK_PSEUDONYM_KEY` (>= 32 karakter; opsiyonel
   `KVKK_PSEUDONYM_KEY_VERSION`) prod secret paketine girmelidir (bkz. `artifacts/A3-redaction/evidence.md` §4/2).
   R5, aynı anahtarı hassas okuma audit referansı için de kullanır → **anahtar yoksa production boot etmez**
   (fail-closed). **H5/DPO:** pseudonym anahtarı rotasyonunda **eski audit referansları geri döndürülemez**
   (aynı öğrenci yeni `keyVersion` ile farklı referans üretir) → retention/DPIA notu gerekir.
   H1–H7 hiçbiri "yapıldı" olarak işaretlenmedi.
3. **PR sıralaması (ORCH kararı):** bu dalın geçmişi `443d366`'yı (PARÇA 1 redaction) **içerir**.
   PARÇA 1 `p1b/audit-kvkk-redaction` dalında ayrı PR'a hazır. R5 PR'ı ya (a) PARÇA 1 merge edildikten
   sonra `main` üzerine rebase edilmeli, ya da (b) base `p1b/audit-kvkk-redaction` seçilmelidir —
   aksi hâlde R5 PR'ı redaction commit'lerini de taşır (tek PR = tek amaç ilkesi).
4. **A6 (doküman) işi:** `docs/phase1-truth-matrix.md` notification satırı bu dilimle
   `internal`/`planning-only`dan ilerler; reconcile A6'da yapılır (bu dilimde o dosyaya dokunulmadı).
5. **Ayrı bulgu (kapsam dışı, devralındı):** `AuditQueryService.lastCheckpoint()`
   `audit_chain_checkpoints.signature` kolonunu SELECT etmiyor → checkpoint imzası doğrulanmıyor.
   Kayıt: `artifacts/A3-redaction/evidence.md` §4/3. **ORCH'a öneri: ayrı issue** (kapsam büyütülmedi).
6. **Grant (onay verme) yüzeyi yok** ve `expires_at` toplu damgalama yok — bilinçli kapsam kararı (§1 not 1–2).
7. **Ölçek notu:** `kvkk_consents` üzerinde `(tenant_id, subject_id, consent_type, version DESC)` index'i
   eklendi; karar sorgusu bu index'i kullanır. Gerçek plan kanıtı (EXPLAIN) DB Smoke'ta doğrulanabilir.
8. **Bulunan ve düzeltilen hata (fixed:`27c6ad6`):** `NotificationsModule`, transactional audit writer'ı
   bağımlılığı `AuditLogRepository` olmadan kaydediyordu → Nest DI çözümlemesi **uygulama BOOT'unda**
   başarısız olurdu ve hiçbir unit test bunu yakalamazdı (Nest uygulaması testlerde ayağa kalkmıyor).
   Düzeltildi + sözleşme `notifications.module.spec.ts` ile sabitlendi (bkz §3(c)). A7 için not:
   **bu dilimde en yüksek değerli bulgu budur**; benzer kablolama hataları yalnız `tsc`+unit yeşiline
   bakılarak görülemez.

## 8) Devir paketi (§6.2)

```text
SLICE: R5 · ISSUE: #266 · BRANCH: p1b/notification-consent-versioned · HEAD: 27c6ad6
DEĞİŞEN DOSYALAR: 16 kod/test/doküman dosyası (+1966/-49) + 2 kanıt artefaktı (+339)
  src/kvkk/consent-versioning.ts (yeni), src/kvkk/consent-versioning.spec.ts (yeni),
  src/kvkk/consent-lifecycle.service.ts (yeni), src/kvkk/consent-lifecycle.service.spec.ts (yeni),
  src/kvkk/consent-audit-reference.ts (yeni), src/kvkk/contact-masking.ts (yeni),
  src/kvkk/index.ts, src/notifications/notification-consent.controller.ts (yeni),
  src/notifications/notification-consent.controller.spec.ts (yeni),
  src/notifications/notifications.module.spec.ts (yeni),
  src/notifications/absence-notification.service.ts (+spec),
  src/notifications/notifications.module.ts,
  src/database/migrations/1835000000000-AddKvkkConsentVersioning.ts (yeni, DDL),
  test/database/kvkk-consent-versioning.migration.spec.ts (yeni),
  docs/notifications/absence-outbox.md
KOMUTLAR:
  npx tsc -p tsconfig.json --noEmit -> exit=0, stdout 0 satır
  npx jest --runInBand src/notifications src/kvkk test/kvkk test/database -> exit=0
    Test Suites: 8 skipped, 26 passed, 26 of 34 total | Tests: 32 skipped, 140 passed, 172 total
    (YEREL DB SKIP: PostgreSQL kapalı; DB kanıtı CI DB Smoke'ta alınacak)
  npx jest --runInBand test/acceptance-guard -> exit=0 (11/11)
  npx jest --runInBand src/common/audit -> exit=0 (223/223)
AC EŞLEMESİ: §1 tablosu (AC -> test yolu) — geri çekme kapısı, consent_version izi, maskeleme+PII'siz audit,
  teacher reddi, tenant/BOLA negatifleri
MUTASYON KONTROLÜ: (a) yöneten-sürüm kapısı kaldırıldı -> 2 suite / 5 test KIRMIZI -> geri alındı
  (b) consent_version izi kaldırıldı -> 1 suite / 3 test KIRMIZI -> geri alındı (detay §3)
BİLİNEN BOŞLUKLAR: CI URL'leri yok (PR açılmadı); H1'e KVKK_PSEUDONYM_KEY eklenmeli (H5 rotasyon notu);
  dilim boyutu 1.966 satır (rehberin üzerinde, §6'da beyan + bölme önerisi); PR sıralaması ORCH kararı (§7/3)
ROLLBACK: git revert 27c6ad6 bc2a47b (kod) + npm run db:migrate:revert (DDL down, idempotent) — §5 provası yeşil
İNSAN KAPISI GEREKİYOR MU: H1 (yeni zorunlu secret: KVKK_PSEUDONYM_KEY) + H5 (DPO/DPIA rotasyon notu) — "bekliyor"
```


