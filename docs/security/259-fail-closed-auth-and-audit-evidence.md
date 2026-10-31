# #259 P1B-02 — Fail-closed auth secrets & durable redacted audit: kanıt

Bu belge, `[P1B-02][SECURITY] Fail-closed auth secrets and durable redacted audit`
(#259) kabul kriterlerinin main üzerinde hangi kod, test ve komutla karşılandığını
kaydeder. Kanıt, kod commit'i `c01174d` (`cline/t5a1nq3x`) üzerinde üretilmiştir.

## 0. Bu dilimin ekledikleri (delta)

| Değişiklik | Dosya | AC |
| --- | --- | --- |
| Açık ortam profili (fallback kapısı) | `src/common/security/environment-profile.ts` | AC-2 |
| Boot-time fail-closed güvenlik duruşu doğrulaması | `src/common/security/security-bootstrap.ts`, `src/main.ts` | AC-1, AC-2 |
| JWT secret + `kid` rotasyon sözleşmesi (issue & verify) | `src/auth/jwt-keyring.ts`, `src/auth/auth.service.ts`, `src/auth/jwt.strategy.ts` | AC-1, AC-3 |
| Audit HMAC key-id zorunluluğu (production) | `src/common/audit/audit-chain.ts` | AC-1, AC-3 |
| Pseudonym / contact fallback'lerinin açık profile bağlanması | `src/kvkk/pseudonym.ts`, `src/kvkk/contact-crypto.ts` | AC-2 |
| Deploy öncesi doğrulama aracı | `scripts/verify-security-posture.ts` | AC-1 |
| Rotasyon + rollback runbook'u | `docs/security/secret-rotation-and-rollback.md` | AC-3 |
| `NODE_ENV` / key-id / contact-key sözleşmesi | `.env.example` | AC-1, AC-2 |

Kapatılan gerçek boşluklar:

1. **`NODE_ENV` set edilmemiş dağıtım sessizce local fallback kullanıyordu.**
   Eski kontrol `(NODE_ENV ?? '') === 'production'` idi; `NODE_ENV` unset olan bir
   konteynerde audit HMAC / pseudonym / contact anahtarları tahmin edilebilir test
   değerlerine düşüyordu. Artık belirsiz ortam fail-closed.
2. **Refresh secret'ı ve audit/pseudonym/contact anahtarları boot'ta değil ilk
   istekte doğrulanıyordu** → eksik yapılandırmayla kısmi servis mümkündü. Artık
   `bootstrap()` Nest uygulamasını oluşturmadan önce tüm sözleşmeyi doğrular ve
   tüm ihlalleri tek hatada toplar.
3. **`JWT_KEY_ID` yalnız `.env.example`'da yazıyordu; kodda karşılığı yoktu**
   (belgelenen rotasyon sözleşmesi uygulanmıyordu). Artık her token `kid` ile
   imzalanır, doğrulamada zorunlu tutulur; `kid` taşımayan/eski `kid` taşıyan
   token reddedilir. JWT algoritması `HS256`'ya sabitlendi.
4. **`AUDIT_HMAC_KEY_ID` production'da zorunlu değildi** (sessizce `key-1`'e
   düşüyordu) → rotasyon izlenemiyordu. Artık production'da zorunlu ve biçim
   doğrulaması var.

## 1. AC eşlemesi

### AC-1 — Production startup fails closed (secrets + key identifiers)

- `src/common/security/security-bootstrap.ts` → `assertSecurityPostureAtStartup()`
  NODE_ENV profili, JWT access/refresh secret (≥32, farklı), `JWT_KEY_ID`,
  issuer/audience, `AUDIT_HMAC_KEY`(+`_KEY_ID`, `_PREVIOUS_KEYS` halkası),
  `KVKK_PSEUDONYM_KEY`(+sürüm), varsa contact key ring'i doğrular; ihlalleri
  birleştirir; gizli değer yazmaz.
- `src/main.ts` bu doğrulamayı `NestFactory.create` ve `app.listen`'dan **önce**
  çağırır (guard test: `src/common/security/security-bootstrap-entrypoint.spec.ts`).
- Testler: `security-bootstrap.spec.ts` (9 test), `jwt-keyring.spec.ts` (11),
  `environment-profile.spec.ts` (12), `local-fallback-isolation.spec.ts` (11).
- Canlı kanıt (aşağıda §3): `NODE_ENV` unset ve eksik/zayıf secret ile süreç
  `FATAL` verip başlamıyor.

### AC-2 — Local/test fallback explicit, isolated, production'da imkânsız

- `resolveRuntimeProfile()` fallback'i yalnız `development|dev|test|local`
  değerlerinde açar; `production|prod` fallback'siz; **unset/tanınmayan → FATAL**.
- Üç bağımsız anahtar ailesi (audit HMAC, pseudonym, contact) bu profili kullanır.
- `localFallbacks` alanı hangi fallback'in kullanıldığını boot logunda açıkça yazar.

### AC-3 — Rotation / key-ID sözleşmesi dokümante + test edilmiş

- `docs/security/secret-rotation-and-rollback.md`: 4 anahtar ailesi için rotasyon,
  doğrulama ve rollback adımları.
- `jwt-keyring.spec.ts`: `kid` damgalama, emekli `kid` reddi, `kid`'siz token reddi,
  rollback senaryosu.
- `audit-chain.spec.ts` + `security-bootstrap.spec.ts`: HMAC halkası, emekli
  anahtarın yalnız doğrulamada kullanılması, bilinmeyen `signature_key_id` →
  `unknown-signature-key`.

### AC-4 — Duyarlı kararlar kalıcı, transactional audit (correlation + purpose)

Mevcut main davranışı doğrulandı (bu dilimde değişmedi):

- İzin kararı: `src/leaves/leave.repository.ts` — karar + etki + projeksiyon +
  audit + outbox tek transaction; audit kaydı `ctx.requestId` taşır.
- KVKK/veri koruma olayları: `src/common/audit/security-audit.service.ts` —
  `purpose` ve `requestId` zorunlu alanlar; `dataprotection.*` ve `auth.*`
  olayları allowlist'li metadata ile yazılır.
- Kanıt: `test/database/leave-decision-transaction.spec.ts`,
  `src/common/audit/*.spec.ts`, `test/kvkk/audit-redaction.spec.ts`.

### AC-5 — Log/artifact'larda ham PII, telefon, not, secret yok

- `action: security.posture.validated` yalnız anahtar kimlikleri, sürüm etiketleri
  ve karakter uzunlukları yazar (test: "never puts secret material into the report").
- `Sensitive Pattern Scanner` (`.github/workflows/sensitive-pattern-scanner.yml`)
  yeni dosyalarla **0 bulgu** üretiyor (yerel replikasyon, §3).
- `test/kvkk/audit-redaction.spec.ts`, `phone.guard`, `redaction-registry` testleri yeşil.

### AC-6 — Leave self-decision ve kimlik hataları güvenli reddeder

- `src/leaves/leave.service.ts`: kendi talebini karara bağlayan aktör ve kimliği
  çözülemeyen aktör, hiçbir mutasyondan ÖNCE `LeaveSelfDecisionException` alır
  (`safeActorTeacherId` catch → deny). Testler: `src/leaves/leave.service.spec.ts`.

### AC-7 — Tenant/BOLA/RBAC, secret scan, SAST/dependency, redaction testleri

Yerelde çalıştırılan ve yeşil olan set §4'te; DB gerektiren suite'ler CI'da
(`db-smoke`, `backend-ci`) koşar.

### AC-8 — Bağımsız verdict'lerin exact head'e bağlanması

Bu belge + issue yorumu `Code HEAD` SHA'sına bağlıdır. Security / KVKK / Data /
Backend verdict'leri aynı SHA üzerinde istenir; insan onayı sayısı sıfır olabilir
ancak bağımsız agent review zorunludur (issue HCO sözleşmesi).

## 2. Canlı boot kanıtı (fail-closed davranışı)

Aşağıdaki komutlar gerçek runtime giriş noktası (`src/main.ts`) ve deploy öncesi
aracı (`scripts/verify-security-posture.ts`) üzerinde çalıştırıldı.

### A. `NODE_ENV` unset → süreç başlamıyor (exit 1)

```bash
env -u NODE_ENV JWT_ACCESS_SECRET=<40> JWT_REFRESH_SECRET=<40> npx ts-node src/main.ts
```

```text
Error: FATAL: security posture validation failed (fail-closed, 1 problem(s)):
 - FATAL: NODE_ENV must be explicitly set to one of production|prod|development|dev|test|local
   before the security posture bootstrap can be resolved (received <unset>). An unset or unknown
   NODE_ENV is never treated as local: the local fallback must be explicit.
# exit code: 1
```

### B. Production + eksik/zayıf secret → tüm ihlaller tek hatada (exit 1)

```bash
NODE_ENV=production JWT_REFRESH_SECRET=short npx ts-node src/main.ts
```

```text
Error: FATAL: security posture validation failed (fail-closed, 5 problem(s)):
 - FATAL: JWT_ACCESS_SECRET is required but missing from environment.
 - FATAL: JWT_REFRESH_SECRET is too weak (5 chars, need >= 32). …
 - FATAL: JWT_ISSUER is required in production but missing from environment.
 - FATAL: AUDIT_HMAC_KEY is required in production but missing from environment.
 - FATAL: KVKK_PSEUDONYM_KEY is required in production but missing from environment.
# exit code: 1
```

### C. Tam production duruşu → geçer (exit 0, yalnız kimlikler raporlanır)

```bash
NODE_ENV=production <JWT/AUDIT/KVKK anahtarları> npx ts-node scripts/verify-security-posture.ts
```

```json
{"ok": true, "report": {
  "profile": "production",
  "jwt": {"keyId": "key-3", "accessSecretChars": 48, "refreshSecretChars": 48, …},
  "audit": {"keyId": "key-2026-10", "retiredKeyIds": ["key-2026-09"], "usingLocalFallback": false},
  "kvkk": {"pseudonymKeyVersion": "p2", "usingLocalFallback": false, "contactKeyId": "contact-p2"},
  "localFallbacks": [], "warnings": [] }}
# exit code: 0  (rapor secret/anahtar DEĞERİ içermiyor)
```

### D. Production + eksik key identifier → exit 1

```text
FATAL: security posture validation failed (fail-closed, 4 problem(s)):
 - FATAL: JWT_KEY_ID is required in production but missing from environment (rotation/key-id contract; …)
 - FATAL: JWT_ISSUER is required in production but missing from environment.
 - FATAL: AUDIT_HMAC_KEY is required in production but missing from environment.
 - FATAL: KVKK_PSEUDONYM_KEY is required in production but missing from environment.
# exit code: 1
```

## 3. Test ve tarama kanıtı

```text
$ npx tsc -p tsconfig.json --noEmit          → 0 hata
$ npm run build                              → başarılı (dist + runtime assets)
$ npx jest --runInBand --testPathIgnorePatterns … test/database test/e2e
  Test Suites: 143 passed, 143 total
  Tests:       1362 passed, 1362 total
$ Sensitive Pattern Scanner regex'leri (src + scripts) → 0 bulgu
```

DB ve tarayıcı gerektiren suite'ler bu sandbox'ta PostgreSQL olmadığı için
çalıştırılmadı; CI'da `db-smoke` (`test/database` + `test:kvkk`) ve `backend-ci`
(`test:e2e`) ile koşar.

Yeni/değişen test dosyaları:

- `src/auth/jwt-keyring.spec.ts` (11)
- `src/auth/jwt.strategy.spec.ts` (+4 — `kid` zorlaması, `HS256` sabitleme)
- `src/auth/auth.service.spec.ts` (+ `kid` taşıyan refresh doğrulaması)
- `src/common/security/environment-profile.spec.ts` (12)
- `src/common/security/security-bootstrap.spec.ts` (9)
- `src/common/security/local-fallback-isolation.spec.ts` (11)
- `src/common/security/security-bootstrap-entrypoint.spec.ts` (3)
- `test/runtime-integration/*` (3 spec: `kid` ile imzalama)

## 4. Açık kalan / insan kararı gereken noktalar

1. **`JWT_KEY_ID` rotasyonu tüm oturumları geçersiz kılar** (çapraz anahtar
   doğrulaması yok). Bu bilinçli bir fail-closed tercih; çok anahtarlı geçiş
   istenirse ayrı bir tasarım (kid→anahtar halkası) gerekir.
2. **`KVKK_CONTACT_KEY` production'da yoksa boot durmaz**, yalnız uyarı loglanır
   ve parent-contact yüzeyi ilk kullanımda fail-closed olur. Bu, mevcut bir
   dağıtımı anahtarsız da olsa ayakta tutmak için bilinçli seçildi; sıkılaştırma
   istenirse `warnings` → hard failure'a çevrilebilir.
3. **DB/E2E kanıtı** bu ortamda koşulamadı (PostgreSQL yok). Verdict için CI
   çalıştırması gerekir.
4. **Bağımsız verdict'ler** (Security / KVKK / Data / Backend) henüz alınmadı;
   AC-8 bunları exact head'e bağlı olarak talep eder.

