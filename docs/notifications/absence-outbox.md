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
4. **PII'siz payload**: `payload_masked` yalnız olay türü, oturum/öğrenci
   kimliği, durum ve kanal taşır; isim, telefon, e-posta veya serbest metin
   yazılmaz.

## Veri modeli

`notification_outbox`:

| Kolon | Not |
|---|---|
| `dedupe_key` | idempotency anahtarı (`UNIQUE (tenant_id, dedupe_key)`) |
| `event_type` | `attendance.absent.locked` |
| `status` | `pending` \| `blocked_consent` \| `dispatched` \| `failed` (DB CHECK) |
| `payload_masked` | jsonb, PII'siz |
| `reason` | engel nedeni (`blocked_consent`, `blocked_channel_consent`) |
| `consent_version` | onay sürümü izi (granüler/versioned consent sonraki dilim) |
| `attempts`, `available_at`, `dispatched_at` | relay deneme/backoff alanları |

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
