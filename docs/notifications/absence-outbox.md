# Devamsızlık Bildirimi Outbox (#266, #265 AC-6)

## Amaç

Kilitlenen bir yoklama oturumundaki devamsızlıklar için veli bildirim **niyetini**,
domain mutasyonuyla **aynı PostgreSQL transaction'ında** kalıcılaştırmak
(transactional outbox). Gönderim ayrı bir relay'e bırakılır; böylece bildirim
kaybı veya çift gönderim, domain verisiyle tutarsız kalmaz.

## Kurallar (fail-closed)

1. **Yalnız `locked` oturum** bildirim üretir. `draft`/`published` oturumda hiç
   satır yazılmaz — yoklaması tamamlanmamış ders veliye duyurulmaz.
2. **Idempotency**: her (oturum, öğrenci) için
   `dedupe_key = attendance.absent:{sessionId}:{studentId}` üretilir ve
   `UNIQUE (tenant_id, dedupe_key)` + `ON CONFLICT DO NOTHING` sayesinde tekrar
   işleme **ikinci satır oluşturmaz**. Kilit zaten idempotent olduğu için
   tekrar `lock` çağrısı erken döner; yine de dedupe kısıtı çift savunmadır.
3. **KVKK onay kapısı (sürüm bazlı, granüler)**: `parent_notification` onayı
   **ve** kanala özel onay (`sms_notification` / `whatsapp_notification` /
   `email_notification`) `approved`, iptal edilmemiş (`revoked_at IS NULL`) ve
   süresi dolmamış olmalıdır. Karar **sürüm bazlıdır**: her onay tipinin yalnız en
   yüksek `version` satırı yönetir; bu satır geri çekildiğinde aynı tipin eski
   (onaylı) sürümü kanalı **açmaz** (`src/kvkk/consent-versioning.ts`). Aksi hâlde
   satır `blocked_consent` / `blocked_channel_consent` olarak yazılır (gönderim
   yok, `reason` kayıtlı) ve `consent_version` o kararı veren yöneten sürümü taşır.
4. **Minimize + pseudonymize payload**: `payload_masked` yalnız olay türü,
   durum, kanal ve **kiracıya kilitli deterministik pseudonym referansları**
   (`studentRef`, `sessionRef`) taşır. Ham öğrenci/oturum UUID'si payload'a,
   log satırına veya audit kaydına YAZILMAZ; isim, telefon, e-posta ve serbest
   metin de yazılmaz. Pseudonym üretimi `src/kvkk/pseudonym.ts` içindedir:
   `HMAC_SHA256(KVKK_PSEUDONYM_KEY, tenantId|scope|rawId)` → geri döndürülemez,
   kiracılar arası eşleştirilemez ve rotasyonda `keyVersion` ile izlenebilir.
   (Not: 2026-09 satırlarında `payload_masked` ham `studentId`/`sessionId`
   taşıyordu ve "PII'siz" ifadesi yanlıştı — #266 review P2.)

## Veri modeli

`notification_outbox`:

| Kolon | Not |
|---|---|
| `dedupe_key` | idempotency anahtarı (`UNIQUE (tenant_id, dedupe_key)`) |
| `event_type` | `attendance.absent.locked` |
| `status` | `pending` \| `blocked_consent` \| `dispatched` \| `failed` (DB CHECK) |
| `payload_masked` | jsonb, PII taşımaz: olay türü + durum + kanal + pseudonym referansları |
| `reason` | engel nedeni (`blocked_consent`, `blocked_channel_consent`) |
| `consent_version` | onay sürümü izi: kararı veren **yöneten** sürüm (`blocked_channel_consent` → kanal sürümü, aksi hâlde `parent_notification` sürümü; hiç onay satırı yoksa `NULL`) |
| `attempts`, `available_at`, `dispatched_at` | relay deneme/backoff alanları |

`student_id` / `session_id` kolonları relay'in alıcıyı çözmesi için ham UUID
tutmaya devam eder (tenant-scoped domain verisi); bu kolonlar log'a, audit
metadata'sına, API yanıtına veya artefakta serialize EDİLMEZ. Bildirim
payload'ı ve log yalnız pseudonym referanslarını taşır.

## Akış

```text
POST /api/v1/attendance/sessions/:id/lock
  └─ tx: session.status = locked
         durable audit (attendance.session.closed)
         AbsenceNotificationService.enqueueLockedAbsenceNotifications(em, …)
            ├─ status != locked            → hiçbir şey yazılmaz
            ├─ onay var  → status=pending
            └─ onay yok  → status=blocked_consent (reason kayıtlı)
  └─ commit
```

## Onay yaşam döngüsü yüzeyi (R5, #266)

| Uç | İzin | Davranış |
|---|---|---|
| `GET /api/v1/notifications/consents/:studentId` | `student:kvkk:read` | Onay satırları (tip, `version`, `state`, `revoked_at`, `expires_at`) + kanal bazlı karar özeti. **Hassas okuma**: iletişim alanları yalnız maskeli döner; okuma durable audit'e (`dataprotection.export.redacted`) `redactionReceipt` ile yazılır. |
| `POST /api/v1/notifications/consents/:studentId/withdraw` | `parent_notification:approve` | Yöneten (en yüksek `version`) satırı `revoked` yapar, `kvkk_consent_events`'e olay yazar ve durable audit'i (`dataprotection.consent.revoked`) **aynı transaction'da** yazar. Eşzamanlı ikinci çağrı `no_change` (çift geçit yok). |

- **Kiracı** yalnız sunucu context'inden alınır; başka kiracının öğrencisi için
  okuma boş, geri çekme `not_found` döner (kayıt varlığı sızdırılmaz).
- **Maskeleme iki katmanlı**: `kvkk_consent_subjects` yalnız maskeli değer saklar;
  okuma yolunda değer maskeli değilse `src/kvkk/contact-masking.ts` yeniden
  maskeler ve `remaskedFields` ile raporlar (ham telefon/e-posta yanıta/log'a
  girmez).
- **Audit PII'siz**: hassas okumanın `entityId`'si ham öğrenci UUID'si değil,
  ondan türetilen deterministik referanstır (`src/kvkk/consent-audit-reference.ts`).
- **Teacher erişemez**: `teacher` rolünün izin listesinde `student:kvkk:read` ve
  `parent_notification:*` **yoktur** (`src/database/seeds/permissions.seed.ts`) →
  her iki route `PermissionGuard` ile reddedilir; öğretmen ham iletişim verisini
  göremez.

## Kanıt

- `src/notifications/absence-notification.service.spec.ts`: yalnız-locked,
  dedupe anahtarı biçimi, onay var/yok/iptal vakaları, **sürüm izi
  (`consent_version`)**, geri çekilen yöneten sürümün kanalı kapalı tutması,
  PII'siz payload, idempotent tekrar (duplicatesSkipped).
- `src/kvkk/consent-versioning.spec.ts`: yöneten sürüm seçimi, geri çekme/süre
  dolması/çelişki (fail-closed) ve kanal kararları.
- `src/kvkk/consent-lifecycle.service.spec.ts`: maskeleme + `redactionReceipt`
  muhasebesi, PII'siz audit `entityId`, tenant filtresi/BOLA negatifi, geri
  çekme (tek transaction, idempotent) ve log'da ham kimlik olmaması.
- `src/notifications/notification-consent.controller.spec.ts`: her route'un
  `@Permissions` sözleşmesi, teacher rolünün reddi, kiracının context'ten gelmesi.
- `test/database/kvkk-consent-versioning.migration.spec.ts`: `version` kolonu,
  CHECK ve yöneten-sürüm index'i smoke'u (gerçek PostgreSQL: CI DB Smoke).
- `src/attendance/attendance-session.service.spec.ts`: `lock` içinde outbox
  portunun **aynı transaction'da** çağrıldığı ve idempotent kilit dönüşünde
  çağrılmadığı.

## Kapsam dışı (sonraki #266 dilimi)

- **Relay/dispatch**: `pending` satırları provider kuyruğuna taşıyan ve
  `notification.sent`/`failed` audit'i yazan zamanlanmış işleyici (R6).
- **Bildirim taslağı yüzeyi** (R7) ve gerçek SMS/e-posta/WhatsApp sağlayıcısı
  (K2: Faz 1b'de sahte provider).
- Retention/arşiv: `dispatched` satırların ve süresi dolmuş onay satırlarının
  (`expires_at`) toplu damgalanması/temizliği (audit retention politikasıyla
  ayrı ele alınır). Karar anında `expires_at` yine fail-closed uygulanır.
