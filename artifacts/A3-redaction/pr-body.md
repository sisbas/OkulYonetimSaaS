# fix(audit,kvkk): key-id bazlı zincir doğrulaması + ham kimlik yerine pseudonym (Refs #266)

> **Durum:** A7 bağımsız verdict'i **GO — PR açılabilir** (`artifacts/verify/A3-redaction/verdict.md`;
> 0 kod blocker, mutasyon ×2 bağımsız doğrulandı, pseudonym bağımsız test edildi). ORCH onayı verildi;
> PR açıldı. Kapanış/`runtime` beyanı CI run URL'leri (DB Smoke + P0 E2E) bağlanmadan YAPILMAZ.

## Amaç
PR #356 açık review thread'lerinde bağımsız doğrulanan **iki gerçek bulguyu** düzeltmek:
1. **P1 — rotasyonda zincir doğrulaması kırılıyor:** `AuditQueryService.verify()` anahtarı
   satırın `signature_key_id`'siyle değil, tek sabit `AUDIT_HMAC_KEY` ile çözüyordu; mekanizma
   (`verifyAuditChain({ resolveHmacKey })`) var olmasına rağmen **wire edilmemişti**. `.env.example`
   "rotasyonda eski anahtarı doğrulama için elde tut" sözleşmesini belgeliyor ama kod bunu
   desteklemiyordu → rotasyon sonrası tüm eski satırlar `signature-mismatch` ile düşerdi.
2. **P2 — "PII'siz" payload iddiası yanlış:** `payload_masked` ham `studentId` + `sessionId`
   taşıyordu (öğrenciye bağlanabilir kalıcı kimlikler).

## Kapsam
- `src/common/audit/audit-chain.ts`: `resolveAuditHmacKeyRing()` (aktif + emekliye ayrılmış
  anahtarlar, `AUDIT_HMAC_PREVIOUS_KEYS`), `auditHmacKeyResolver(ring)`; bozuk/zayıf/aktif-id
  tekrarı → FATAL.
- `src/common/audit/audit-query.service.ts`: `verify()` key-id bazlı doğrulama yapar; boot'ta
  anahtar halkası fail-closed doğrulanır. Bilinmeyen key-id → `unknown-signature-key` (reddet).
- `src/kvkk/pseudonym.ts` (yeni): `HMAC_SHA256(KVKK_PSEUDONYM_KEY, tenantId|scope|rawId)` ile
  deterministik, kiracı-kilitli, kapsam-ayrık pseudonym; production'da fail-closed.
- `src/notifications/absence-notification.service.ts`: payload `studentRef`/`sessionRef` taşır;
  log satırı ham `sessionId` yerine `sessionRef` yazar; boot'ta pseudonym anahtarı doğrulanır.
- `src/notifications/parent-notification.service.ts`: log'daki ham `subjectId` → `subjectRef`.
- `src/kvkk/index.ts`, `.env.example`, `docs/notifications/absence-outbox.md` (yanlış "PII'siz"
  ifadesi düzeltildi), testler (2 yeni spec bloğu + 2 test dosyası güncellendi).

## Kapsam dışı
- R5 granüler/versioned consent (sonraki parça), R6 relay worker, gerçek SMS/e-posta/WhatsApp
  sağlayıcısı (K2: sahte provider), DDL/migration (bu PR'da migration yok),
  `docs/phase1-truth-matrix.md` metni (A6 sahipliğinde).

## Acceptance criteria
- [x] Zincir doğrulaması **key-id bazlı** çalışır: rotasyon öncesi satır emekliye ayrılmış
  anahtarla, sonrası aktif anahtarla doğrulanır (tek koşuda yeşil).
- [x] **Yanlış/bilinmeyen key-id → doğrulama başarısız** (`unknown-signature-key`), key-id aktif
  anahtarı işaret edip imza başka anahtarla üretilmişse `signature-mismatch`.
- [x] Bozuk/zayıf/aktif-id tekrarı içeren konfigürasyon boot'ta FATAL (fail-closed).
- [x] `payload_masked` ve log yüzeyleri ham öğrenci/oturum/veli UUID'si taşımaz; pseudonym
  referansları deterministik ve kiracı-kilitlidir.
- [x] Tüm yerel testler + tip kapısı yeşil; mutasyon kontrolü kırmızıya döndüğü gösterildi.

## Test çıktısı

Yerel doğrulama (PostgreSQL kapalı, DB suite'leri skip — skip PASS sayılmadı):
```text
PASS  npx tsc -p tsconfig.json --noEmit                -> exit=0, stdout boş
PASS  npx jest --runInBand src/notifications src/kvkk test/kvkk test/database
        Test Suites: 8 skipped, 21 passed, 21 of 29 total
        Tests:       32 skipped, 96 passed, 128 total   (exit=0)
PASS  npx jest --runInBand src/common/audit
        Test Suites: 9 passed, 9 total / Tests: 223 passed, 223 total (exit=0)
FAIL  Mutasyon (a) key-id seçimi kaldırıldı -> audit-query spec FAIL (2 failed)  [beklenen KIRMIZI] -> geri alındı -> PASS
FAIL  Mutasyon (b) pseudonym yerine ham student_id -> notifications spec FAIL   [beklenen KIRMIZI] -> geri alındı -> PASS
```
Mutasyon kontrolü bağımsız olarak A7 tarafından da yeniden üretildi (KIRMIZI -> geri alındı); worktree `443d366`'da temizdir. DDL/migration yok.

## KVKK/audit etkisi
- Ham kişisel veri (öğrenci/oturum/veli UUID'si) artık **hiçbir log, payload, audit metadata veya
  API yanıtında** yok; yerine anahtar gerektiren deterministik pseudonym var (geri döndürülemez).
- Audit zinciri bütünlüğü güçlendi: çoklu anahtar halkası ile rotasyon sonrası doğrulama
  mümkün; bilinmeyen anahtar sessizce kabul edilmiyor.
- Yeni zorunlu prod secret: `KVKK_PSEUDONYM_KEY` (>= 32 karakter) + `KVKK_PSEUDONYM_KEY_VERSION`.
  **H1 güncellemesi gerekir**; deploy sırası: önce env, sonra kod (yoksa boot fail-closed).
- **H5 / DPO onayı gerekir (insan kapısı, ajan kapatamaz):** pseudonym anahtarı **rotasyona
  uğratıldığında** yeni `keyVersion` üretilir ve eski pseudonym referansları **geri döndürülemez**
  biçimde çözülemez hâle gelir. Bu, denetim/korelasyon amacıyla saklanan referansların retention
  penceresini etkiler → DPIA/retention politikası ve rotasyon prosedürü DPO (H5) tarafından
  onaylanmalıdır. Rotasyon çalıştırılmadan önce `AUDIT_HMAC_PREVIOUS_KEYS` deseniyle uyumlu bir
  "eski pseudonym sürümünü arşivle" adımı planlanmalıdır.
- Tenant izolasyonu: pseudonym `tenantId` ile kilitli (kiracılar arası eşleştirme yapılamaz);
  audit doğrulama sorguları değişmedi, `@Permissions` yüzeylerine dokunulmadı.

## Rollback
`git revert <sha>` — migration/DDL olmadığı için veri rollback'i gerekmez. Prod'da env
değişkeni eklenmeden deploy edilirse süreç boot etmez (fail-closed); bu durumda önceki imaja
dönülür. Detay + prova çıktısı: `artifacts/A3-redaction/evidence.md`.

## CI run referansı

PR #361 açılışıyla CI turları başladı (aşağıdaki run id'ler bu PR'ın head'ine bağlıdır):
- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36302482092
- DB Smoke (skip yasak): https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36302482209
- Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36302482182
- P0 browser E2E and artifact evidence: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36302482117
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36302482146
- Sensitive Pattern Scanner: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36302482181
- PR Governance: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/36302482132

`runtime`/kapanış beyanı YALNIZ bu zorunlu check'ler yeşil olduğunda yapılır; `skipped`/`cancelled`/`queued` PASS sayılmaz. Vercel (H2 insan kapısı) bu PR'da da kırmızıdır ve gizlenmemektedir.
