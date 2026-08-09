# WP-07F — SECURITY/KVKK PR-2B-A CHECKLIST

> PR-2b-A (production `/api/v1` reachability for #185) Security/KVKK checklist — manuel audit kaydı.
> Konvansiyon: `docs/security/pr2-security-kvkk-review.md` (PR-2a) ile aynı çizgi; bu dosya PR-2b-A'ya özgü detaylı checklist'tir.
> Bağlayıcı sınırlar: #190 HOLD · #191 HOLD · PR-2b = PLANNING ONLY · draft aşamasında secret kullanılmadı.

## Karar

- **GO**

## Security checklist

- [x] No raw secret logs (workflow env'leri loglanmaz)
- [x] No Authorization header logs
- [x] No cookie logs
- [x] No raw backend body (yalnız contract alanları)
- [x] No raw stack trace
- [x] No production PII fixture
- [x] No parent/guardian contact data
- [x] No notification payload
- [x] No guidance/free-text PII
- [x] Artifact metadata allowlist tanımlı
- [x] Sanitized redirect location only (PROTECTED_PREVIEW_BLOCKED'ta yalnız sanitize edilmiş location kaydedilir)
- [x] Protected-preview PASS olamaz
- [x] Static HTML PASS olamaz
- [x] Vercel NOT_FOUND PASS olamaz
- [x] Uncontrolled JSON PASS olamaz
- [x] Scanner/GitGuardian tek başına Security/KVKK PASS sayılmaz

## KVKK checklist

- Veli/eğitmen/öğrenci kişisel verisi işlenmez; gözlem yalnız public endpoint yanıt kontratına dokunur.
- Artifact redaksiyonu execution sonrası manual audit ile doğrulanır (PR-2a `pr2-security-kvkk-review.md` konvansiyonu).

## Allowed artifact fields

- `observation-identity.json` sözleşme alanları (`commitSha`, `branchRef`, `productionDeploymentId`, `productionDeploymentUrl`, `productionAlias`, `targetBaseUrl`, `observationTimestamp`, `artifactName`, `reportContentDigest`, `deploymentCommitSha`, `deploymentCommitSource`, `deploymentMetadataStatus`, `apiReachabilityStatus`, `overallStatus`, `checks[]`)
- Sanitize redirect location; `failureReason`; status/content-type; kontrat JSON anahtarları

## Forbidden artifact fields

- Secret/token/cookie/Authorization header değerleri
- Raw response body, raw stack trace
- Parent/guardian iletişim verisi, notification payload, free-text PII
- `artifactDigest` (rapor içinde rezerve)

## Redaction requirements

- Vercel metadata/protection authority kullanımında secret değerler log/artifact'a geçemez; yalnız PASS/FAIL durumu kaydedilir.
- Redirect location yalnız sanitize formda.

## Secret/authority boundary

- `VERCEL_DEPLOYMENT_METADATA_TOKEN`, `VERCEL_PROTECTION_BYPASS_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET` yalnız execution'da ve CEO checkpoint sonrası kullanılabilir; draft bu secret'lara dokunmaz.

## Security/KVKK PASS rule

- 16 checklist maddesi + redaksiyon audit'i + artifact allowlist uyumu; scanner'lar ek kanıt, tek başına PASS değil.

## Blocking risks

- Execution sırasında raw body/stack trace sızıntısı → quarantine + escalation (PROMPT 6 triage).
- Protected preview'in PASS'a çevrilmesi → mimari ihlal, no-close.

## CEO checkpoint

- REQUIRED LATER (secret/metadata/protection authority)
- NOT REQUIRED FOR DRAFT

## CTO recommendation

- **GO.** Checklist PR-2a konvansiyonu ve KVKK testleri (`kvkk/` suite) ile tutarlı; draft aşamasında secret kullanılmadı.

<!-- PR-2B-A SECURITY/KVKK: GO / PLANNING ONLY / NO SECRET USE -->
