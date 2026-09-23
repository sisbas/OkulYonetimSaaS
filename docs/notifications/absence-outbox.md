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
3. **KVKK onay kapısı**: `parent_notification` onayı **ve** kanala özel onay
   (`sms_notification` / `whatsapp_notification` / `email_notification`) `approved`,
   iptal edilmemiş (`revoked_at IS NULL`) ve süresi dolmamış olmalıdır. Aksi
   hâlde satır `blocked_consent` olarak yazılır (gönderim yok, `reason` kayıtlı).
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
| `consent_version` | onay sürümü izi (granüler/versioned consent sonraki dilim) |
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

## Kanıt

- `src/notifications/absence-notification.service.spec.ts`: yalnız-locked,
  dedupe anahtarı biçimi, onay var/yok/iptal vakaları, PII'siz payload,
  idempotent tekrar (duplicatesSkipped).
- `src/attendance/attendance-session.service.spec.ts`: `lock` içinde outbox
  portunun **aynı transaction'da** çağrıldığı ve idempotent kilit dönüşünde
  çağrılmadığı.
- `test/database/notification-outbox.migration.spec.ts`: tablo/kısıt smoke'u.

## Kapsam dışı (sonraki #266 dilimi)

- **Granüler + versioned + withdrawable consent** modeli (`consent_version`
  şu an boş; onay `kvkk_consents` üzerinden okunuyor).
- **Relay/dispatch**: `pending` satırları provider kuyruğuna taşıyan ve
  `notification.sent`/`failed` audit'i yazan zamanlanmış işleyici.
- Retention/arşiv: `dispatched` satırların temizliği (audit retention
  politikasıyla ayrı ele alınır).
