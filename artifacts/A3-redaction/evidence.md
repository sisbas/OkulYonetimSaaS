# A3 — Redaction düzeltmeleri (PR #356 review bulguları)

**Dilim:** PARÇA 1 (R5 öncesi P0 governance blocker düzeltmesi) · **Issue:** #266 ·
**Review kaynağı:** PR #356 açık thread'leri (P1 "Record multi-key verification as an
audit blocker", P2 "Stop describing student-linked payloads as PII-free")
**Branch:** `p1b/notification-consent-versioned` · **Baz:** `origin/main` @ `15c5ab8`
**Sahiplik sınırı:** `src/common/audit/**`, `src/notifications/**`, `src/kvkk/**`
(ek olarak `.env.example` ve `docs/notifications/absence-outbox.md` — bu iki dosya yalnız
bu düzeltmenin doküman satırları için değiştirildi; `src/app.module.ts`, `package.json`,
`src/database/data-source.ts` **dokunulmadı**).
**Kapsam dışı:** R5 consent versioning (sonraki parça), R6 relay, gerçek SMS/e-posta/WhatsApp
sağlayıcısı (K2), DDL/migration (bu dilimde **migration yok**), `docs/phase1-truth-matrix.md`
(A6 sahipliğinde — aşağıda "bilinen boşluklar" içinde).

---

## 1) Bulgu → düzeltme eşlemesi

| # | Bulgu (review) | Düzeltme | Kanıt |
|---|---|---|---|
| **P1** | `AuditQueryService.verify()` tek sabit anahtar çözüyordu (`resolveAuditHmacKey()`), `record.signature_key_id` ile `resolveHmacKey(...)` **wire edilmemişti** → rotasyon sonrası tüm eski satırlar `signature-mismatch` | `resolveAuditHmacKeyRing()` + `auditHmacKeyResolver(ring)` eklendi (`src/common/audit/audit-chain.ts`); `verify()` artık anahtarı **satırın kendi key-id'siyle** seçiyor; emekliye ayrılmış anahtarlar `AUDIT_HMAC_PREVIOUS_KEYS` ile tutuluyor; bilinmeyen key-id → `unknown-signature-key` (fail-closed); bozuk/zayıf/aktif-id'yi tekrarlayan konfigürasyon boot'ta FATAL | `src/common/audit/audit-chain.spec.ts` (key ring sözleşmesi, 4 test), `src/common/audit/audit-query.service.spec.ts` (rotasyon + bilinmeyen key-id + uyuşmayan imza + malformed env, 4 test) |
| **P2** | `payloadMasked` ham `studentId` + `sessionId` taşıyordu → "PII'siz" ifadesi yanlış | Payload artık **kiracıya kilitli deterministik pseudonym** taşıyor (`studentRef`, `sessionRef`); ham UUID payload'a/log'a yazılmıyor; aynı sınıftan bir sızıntı olan `ParentNotificationService` log'undaki ham `subjectId` de pseudonym'lendi | `src/kvkk/pseudonym.ts` + `pseudonym.spec.ts` (11 test), `absence-notification.service.spec.ts` (payload + log testleri), `parent-notification.service.spec.ts` (log testi) |

**Pseudonym sözleşmesi** (`src/kvkk/pseudonym.ts`):
`HMAC_SHA256(KVKK_PSEUDONYM_KEY, tenantId|scope|rawId)[0..32]` → `"<keyVersion>:<scope>:<digest>"`.
Deterministik (korelasyon korunur), kiracı-kilitli (kiracılar arası eşleştirme yok), kapsam-ayrık
(öğrenci ↔ oturum çapraz eşleştirme yok), anahtar olmadan geri döndürülemez. Anahtar
fail-closed: production'da eksik/zayıf → boot FATAL; local/test → izole anahtar.

## 2) Kanıt seti (§8 — 7 satır)

| # | Kanıt | Sonuç |
|---|---|---|
| 1 | **Yerel tip + test** | `npx tsc -p tsconfig.json --noEmit` → **exit=0**, stdout **0 satır** ✓ <br> `npx jest --runInBand src/notifications src/kvkk test/kvkk test/database` → **exit=0**, `Test Suites: 8 skipped, 21 passed, 21 of 29 total` / `Tests: 32 skipped, 96 passed, 128 total` (46.6 s) <br> `npx jest --runInBand src/common/audit` → **exit=0**, `Test Suites: 9 passed, 9 total` / `Tests: 223 passed, 223 total` <br> (audit suite'leri brief'teki komut kümesinde yok; ayrıca koşturuldu ve kayda geçti.) |
| 2 | **DB (CI)** | **Yerel skip** (PostgreSQL 5432 kapalı): 8 suite / 32 test DB bağlı olduğu için skip. Gerçek-PostgreSQL kanıtı yalnız **DB Smoke** (`test:database:required`, skip yasak) ile alınır → **PR açılmadığı için run URL'i henüz yok**; PR açılışında eklenecek (A7 GO + ORCH onayı sonrası). Bu dilimde DDL/migration yok. |
| 3 | **Kabul (CI)** | P0 browser E2E/guard run URL'i aynı şekilde PR açılışında alınacak. Bu dilim runtime uçlarını (auth/tenant) değiştirmiyor. |
| 4 | **Mutasyon kontrolü** | **(a)** `resolveHmacKey: auditHmacKeyResolver(keyRing)` satırı çıkarılıp yerine `hmacKey: keyRing.current.key` yazıldı (P1 öncesi hâl) → `npx jest src/common/audit/audit-query.service.spec.ts` **KIRMIZI** (`Tests: 2 failed, 5 passed`; rotasyon testi `reason: "signature-mismatch"` beklenen `null`, key-id testi beklenen `unknown-signature-key` yerine `signature-mismatch`). Satır geri alındı → yeşil. <br> **(b)** `studentRef: pseudonymize(...)` yerine ham `record.student_id` yazıldı → `npx jest src/notifications` **KIRMIZI** (`Tests: 1 failed, 11 passed`; `Expected substring: not "44444444-…"` ham UUID payload'da yakalandı). Geri alındı → yeşil. |
| 5 | **Redaction** | `src/notifications`, `src/kvkk`, `src/common/audit` içinde `logger.*` çağrılarında ham `studentId/student_id/sessionId/subjectId/rawId/phone/email` interpolasyonu taraması → **BULGU=0**. `src/notifications` içinde `payloadMasked: { ... studentId/sessionId }` biçiminde ham UUID alanı taraması → **BULGU=0**. Jest koşu loglarındaki outbox satırı yalnız `sessionRef` (pseudonym) taşıyor; artefakt/log/yanıt yüzeylerinde ham PII yok. |
| 6 | **Rollback provası** | Aşağıdaki "Rollback" bölümü — gerçek koşu, gözlenen sonuçla birlikte. |
| 7 | **Verdict** | `artifacts/verify/<slice>/verdict.md` — **A7 tarafından üretilecek**; bu dosya ajan kanıtıdır, verdict değildir. Tüketici: ORCH intake (§6.2) → A7 bağımsız doğrulama. |

**Üretilemeyen kanıt (fail-closed beyanı):** CI run URL'leri (satır 2–3) yalnız PR açıldıktan
sonra üretilebilir; PR talimat gereği **açılmadı**. Bu nedenle dilim "runtime/pilot-ready"
kabul edilmez, "yerel yeşil + CI bekliyor" olarak raporlanır.

## 3) Rollback

- **Kod rollback (bu dilim):** dilim tek commit'tir (`HEAD` → devir paketinde).
  `git revert <sha>` (veya `git checkout <baz> -- <dosyalar>`) yeterlidir; **DDL/migration
  olmadığı için veri rollback'i gerekmez**.
- **Rehearsal (gerçek koşu):** aşağıda "Rollback provası çıktısı" bölümü.
- **Runtime rollback notu:** `KVKK_PSEUDONYM_KEY` yeni bir **zorunlu prod secret**'tır (H1).
  Verilmezse production boot etmez (fail-closed — ham kimlik pseudonym'lenemediği için
  bilinçli). Bu yüzden deploy sırası: **önce env değişkeni, sonra kod**.

### Rollback provası çıktısı

```text
(commit sonrası dolduruldu — aşağıdaki bölüme bakınız)
```

## 4) Bilinen boşluklar / devir notları

1. **CI kanıtı yok** (PR açılmadı): DB Smoke + P0 E2E run URL'leri PR açılışında eklenecek.
2. **H1 (insan kapısı) güncellemesi gerekiyor:** `KVKK_PSEUDONYM_KEY` (>= 32 karakter) ve
   opsiyonel `KVKK_PSEUDONYM_KEY_VERSION` prod secret olarak eklenmeli. Pseudonym rotasyonu
   **eski referansları geri döndürülemez kılar** (yeni keyVersion üretir) → DPO/H5 ile
   konuşulmalı. H1–H7 hiçbiri "yapıldı" olarak işaretlenmedi.
3. **Ayrı bulgu (kapsam dışı bırakıldı, A7/ORCH kararı):** `AuditQueryService.lastCheckpoint()`
   `audit_chain_checkpoints.signature` kolonunu SELECT etmiyor; yani checkpoint'in kendi HMAC
   imzası doğrulanmıyor (kırpma senaryosunda trust-anchor doğrulanmamış kalıyor). Bu dilimin
   iki review bulgusundan bağımsızdır; ayrı issue/thread önerilir.
4. **A6 (doküman) işi:** `docs/phase1-truth-matrix.md` satırlarındaki "PII'siz" ifadesi ve
   multi-key doğrulama notu, kod artık düzeltildiği için A6 reconcile'ında güncellenmeli
   (PR #356 thread'leri bu düzeltmeyle `fixed:<sha>` olarak kapatılabilir).
5. **`dedupe_key` ve `student_id`/`session_id` kolonları** ham UUID taşımaya devam eder:
   bunlar tenant-scoped domain verisidir (relay alıcıyı buradan çözer), log/audit/artefakt/API
   yanıtına serialize EDİLMEZ. Payload ve log yüzeyi pseudonym taşır.
