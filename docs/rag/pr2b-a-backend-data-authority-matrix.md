# WP-07F — PR-2B-A API Authority Matrix (Backend & Data)

> PROMPT 3 (Backend & Data) çıktısı — `docs/rag/pr2b-a-draft-package.md` §3 (Evidence Checklist) canonical kaynağı.
> CTO dispatch (2026-08-09) uyarınca PR-2b-A draft paketinin Backend & Data karar kaydıdır.
> Planning only: runtime davranışı değiştirmez; execution (production observation) ayrı yetki ister.

## Karar

- **GO**

## /api/v1 health authority

- Endpoint: `/api/v1/health` (Nest AppModule, api/v1 global prefix).
- Kanıt: application-controlled JSON yanıtı; Vercel platform NOT_FOUND,
  static HTML, uncontrolled JSON hiçbiri PASS sayılmaz.
- Identity: response content-type `application/json`; expected status 200;
  exact health contract values are `status=ok`,
  `service=okul-yonetim-saas-api`, and `applicationType=backend-api`.

## Known endpoint response matrix

- `/api/v1/health` → 200 + controlled JSON (authority ispatının birincil
  endpoint'i)
- Bilinen `/api/v1/*` route'lar (uygulama route kataloğuna göre, execution
  öncesi sabitlenir) → 200/4xx + Nest-controlled JSON
- `/api/v1` altı bilinmeyen path → Vercel NOT_FOUND veya Nest 404; her iki
  durum da authority ispatı için PASS değildir (yalnız known set test edilir)
- Statik yollar (`/runtime`, `/`, `/demo`, `/full-vision`) → authority dışı

## Controlled JSON contract

- endpoint: `/api/v1/health` (birincil)
- expected status: 200
- expected content-type: `application/json` (Nest üretimi)
- required JSON keys: `status`, `service`, `applicationType`
- required JSON values: `status=ok`, `service=okul-yonetim-saas-api`,
  `applicationType=backend-api`
- forbidden response types: `text/html`, platform NOT_FOUND body, raw
  backend error body, uncontrolled passthrough JSON
- emitted artifact failureReason mapping: `API_UNREACHABLE` |
  `PROTECTED_PREVIEW_BLOCKED` | `UNEXPECTED_STATUS` | `HEADER_MISMATCH` |
  `OBSERVATION_CHECK_FAILED` | `REQUEST_TIMEOUT`
- response classifications folded into `API_UNREACHABLE`: static HTML,
  Vercel NOT_FOUND, uncontrolled JSON

## Forbidden response matrix

- static HTML = FAIL; emitted failureReason `API_UNREACHABLE`
- Vercel NOT_FOUND = FAIL; emitted failureReason `API_UNREACHABLE`
- uncontrolled JSON = FAIL; emitted failureReason `API_UNREACHABLE`
- `PROTECTED_PREVIEW_BLOCKED` = FAIL
- `API_UNREACHABLE` = FAIL (normal observation)
- `API_UNREACHABLE` = EXPECTED FAIL (yalnız izole self-test; failure
  contract ispatı, erişilebilirlik ispatı değildir)

## Tenant / branch regression

- tenant-local occurrence-date regression planı: tenant başına yerel
  işlem tarihi kayması olmadan health/known endpoint yanıtı doğrulanır.
- multi-branch own-read regression planı: her branch yalnız kendi
  tenant verisini okur; gözlem sırasında cross-branch veri erişimi
  sınanmaz (kod değişikliği yok; planlama kaydı).

## Synthetic fixture policy

- Synthetic fixtures yalnız PII-free (isim, telefon, e-posta, free-text,
  guidance verisi içermez); production PII fixture yasak.

## Security/KVKK implications

- Artifact'a raw response body, raw stack trace, secret/cookie/header
  girmeyecek; yalnız allowlist metadata + contract alanları.
- Protected preview hiçbir koşulda PASS sayılamaz.

## Rollback considerations

- Bu PR runtime davranışı değiştirmez; revert yüzeyi yalnız
  production-reachability execution hattındadır (PROMPT 6).

## Backend blockers

- Yok (planning only). Execution öncesi: known route kataloğunun
  kodla çapraz doğrulanması gerekir.

## CTO recommendation

- GO. Controlled JSON contract ve failure mapping, mevcut
  `production-observation.spec.ts` classification'ı ile birebir uyumlu.

<!-- PR-2B-A API AUTHORITY MATRIX: PLANNING ONLY / NO RUNTIME CHANGE / NO EXECUTION -->
