# #265 — Terminal Rol Verdict'leri (AC-8)

**Kapsam:** `[P1B-08][ATTENDANCE] Student roster and schedule-derived session lifecycle` (#265)
**Kod head (exact):** `c30a5a856e0f4f76d1d00687000736b4a7c1dd78` — branch `p1b/259-durable-audit`
**PR'lar:** #352 (`feat(audit): tamper-evident durable audit chain…`) ve #351 (attendance KVKK/enforcement/correction); #352 #351 üzerine kuruludur (stacked).
**Tarih:** 2026-09-22 · **Owner:** Backend/Architecture (HCO loop)

## Verdict kuralı

Her rol için **tek ve terminal** verdict verilir: `GO` veya `NO-GO`. "Pending", "awaiting", "sonra
değerlendirilecek" kabul edilmez. Kanıtı olmayan bir kapsam **NO-GO**'dur ve gerekçesi scope
numarasıyla yazılır. Verdict'ler yalnız yukarıdaki exact kod head'ine bağlıdır; yeni bir commit
head'i değiştirirse verdict'ler yeniden bağlanmalıdır. Bu doküman yalnız dokümantasyondur
(kod değişikliği içermez), bu nedenle kanıt head'i değiştirmez.

## Kanıt tabanı (exact head `c30a5a8`)

| Gate | Sonuç | Referans |
|---|---|---|
| Backend CI | SUCCESS | run `35748508619` |
| DB Smoke (gerçek PostgreSQL) | SUCCESS | run `35748508715` |
| Sprint 1 Quality Gate | SUCCESS | run `35748508649` |
| Gate 1 CI | SUCCESS | run `35748508750` |
| PR Governance (Body / AC / Issue / Rollback / Thread Resolution) | SUCCESS | PR #352 checks |
| Sensitive Pattern Scanner | SUCCESS | PR #352 checks |
| GitGuardian scan | SUCCESS | PR #352 checks |
| Yerel (head `c30a5a8`) | unit 535/535 · targeted 509/509 · `tsc --noEmit` exit 0 · `npm run build` SUCCESS | bu PR'ın Test çıktısı bölümü |

**AC-7 (gerçek PostgreSQL kanıtı)** — `test/database/audit-chain-concurrency.spec.ts` ve
`test/database/attendance-correction-concurrency.spec.ts`, CI DB Smoke'ta `test:database:required`
(skip yasak) ile çalışır:

- 8 paralel audit yazımı tek çatallanmamış zincir üretir; her özet `prev_hash + payload`'dan
  yeniden üretilebilir ve her imza HMAC ile doğrulanır.
- Kalıcı bir satırın sonradan değiştirilmesi `entry-hash-mismatch` ile tespit edilir (tamper-evidence).
- Kuyruktan satır silinmesi `expectedLastSequence` → `truncated-chain` ve yayınlanmış
  `expectedHeadHash` → `head-hash-mismatch` ile tespit edilir.
- Aynı `expectedVersion` ile iki paralel düzeltmede **tam olarak biri** başarılı olur; diğeri
  409 `ConflictException` alır. `correction_count = 1`, `attendance_sessions.version = 2`,
  `attendance.record.corrected` audit kaydı **tam olarak 1** ve zincir geçerlidir.
- Öğretmen kendi oturumunda bile düzeltemez (görevler ayrılığı) ve hiç audit kaydı üretilmez.

## Rol verdict'leri

### Architecture — **GO**
- M5 authority chain (`ScheduleEvent → AttendanceSession → AttendanceRecord`) korunur; session yalnız
  yayınlanmış `ScheduleVersion`'dan türer (pessimistic lock + atomik publish kontrolü).
- Immutable migration kuralı §6 uygulanır: mevcut migration'lar değiştirilmedi; iki yeni FOLLOW-UP
  migration idempotenttir (`ADD COLUMN IF NOT EXISTS`, `DROP … IF EXISTS`).
- Port/adapter deseni (leaves ile aynı) ve DI bağlantısı modül sınırlarını bozmaz.
- Residual: yok.

### Backend — **GO**
- `correctRecord` (yalnız kilitli oturum + yalnız gözetim rolü + kapalı gerekçe sözlüğü + optimistic
  concurrency), `lock`/`markRecord` pessimistik kilitli transaction'a taşındı, notes yazma-yolu maskesi,
  durable audit aynı transaction'da.
- Enforcement: controller bazında `@Permissions` kapsamı mimari test ile kilitli
  (`test/rbac/controller-enforcement-consistency.spec.ts`), mutasyon kontrolüyle doğrulandı.
- Kanıt: Backend CI `35748508619` SUCCESS; unit 535/535; targeted 509/509.

### Data/DB — **GO**
- Fresh PostgreSQL'de migration'lar uygulanır (DB Smoke `35748508715`), `test:database:required`
  skip'siz geçer, migration idempotency denetleyicisi yeşildir.
- `audit_logs` zincir kolonları (`seq bigserial`, `prev_hash`, `entry_hash`, `signature`,
  `signature_key_id`) + `correction_*` kolonları DB CHECK/UNIQUE kurallarıyla tutarlıdır.
- Concurrency: advisory-lock altında paralel audit yazımı ve eşzamanlı düzeltme yarışı gerçek DB'de
  doğrulandı (yukarıdaki AC-7 kanıtı).
- Residual: yok.

### Security — **GO**
- Fail-closed: üretimde `AUDIT_HMAC_KEY` yok/zayıf ise süreç **bootstrap'ta** durur; imza rotasyonu
  `signature_key_id` ile izlenir; zincir kurcalama/kırpma tespit edilir.
- BOLA/BOLA-dışı negatifler: öğretmen başka dersin oturumuna ve (kendi oturumunda bile) düzeltmeye
  erişemez; route kapsamı `@Permissions` zorunluluğuyla kilitlidir.
- Residual: ürün seviyesi server-authoritative kurum/şube/rol bağlamı ve default-deny sözleşmesi
  **#339** kapsamındadır (bu verdict onu kapsamaz).

### KVKK — **GO (teslim edilen kapsam)**
- Serbest notlar (mark + düzeltme) yazma yolunda maskelenir; audit metadata allowlist'i PII taşımaz
  (serbest metin/telefon/e-posta/gövde reddedilir); düzeltme gerekçesi kapalı sözlükten koddur.
- Audit satırları domain mutasyonuyla aynı transaction'da commit/rollback olur (Madde III).
- Residual (izlenen, bu PR'ın kapsamı dışı): **audit retention policy** ve query/verifier API'si
  #259'un kalan dilimidir.

### QA (otomatik kanıt) — **GO**
- Unit + RBAC + KVKK + contracts + gerçek PostgreSQL suite'leri yeşil; mutasyon kontrolü ile testin
  gerçekten kırmızıya döndüğü kanıtlandı.
- Residual (farklı kapsam): tarayıcı/UI journey ve pilot gözlemi **#269** — ayrı verdict.

### QA (UI journey / acceptance) — **NO-GO**
- `test/e2e` = 0 spec; fresh-DB UI journey, ekran görüntüsü/video/axe kanıtı yok.
- Bloklayıcı: **#269** (ve **#264** erişilebilirlik durumları).

### UX — **NO-GO**
- Rol-farkında Türkçe production shell için WCAG 2.1 AA durumları ve E2E kanıtı üretilmedi.
- Bloklayıcı: **#264**.

### Product — **NO-GO (kapanış için)**
- Kilitli devamsızlık → idempotent domain event → veli bildirimi akışı yok.
- Bloklayıcı: **#266** (consent + outbox); ayrıca **#269** UI journey.

## Bütünsel karar

- **GO:** #351 ve #352'nin sırayla merge edilmesi (teslim edilen kapsam için kanıt tam: exact head,
  CI, gerçek PostgreSQL concurrency/tamper kanıtı, terminal verdict'ler).
- **NO-GO:** #265'in `runtime` olarak işaretlenmesi/kapatılması. Truth matrix satırı `internal`
  kalır; kalan blokajlar **#266** (locked-absence event + notification) ve **#269** (fresh-DB UI
  journey + pilot gözlemi), UX için **#264**.
- **Yeniden doğrulama tetikleyicileri:** head değişimi, migration değişimi, audit zincir/anahtar
  sözleşmesi değişimi veya `@Permissions` kapsam değişimi → bu doküman yeniden bağlanmalıdır.

