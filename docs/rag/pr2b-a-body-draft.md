# WP-07F PR-2b-A: production /api/v1 routing authority evidence for #185

## Amaç

PR-2b-A'nın amacı, production ortamında exact-head /api/v1/health veya
belirlenmiş bilinen /api/v1 endpoint üzerinden Nest-controlled JSON
authority kanıtını hazırlamak ve #185 closure için evidence package
üretmektir.

Bu PR:
- #190 browser reproducibility kapsamını devralmaz.
- #191 governance constitution kapsamını devralmaz.
- #185 veya #145'i otomatik kapatmaz.
- Production observation/deployment authority execution için CEO
  checkpoint gerektiğini açıkça belirtir.
- Draft aşamasında yalnız paket tanımıdır; execution yoktur.

Refs #185
Refs #145

## Karar (Architecture & Platform)

- **PR-2B-A AUTHORITY BOUNDARY: GO** — draft aşaması planning only; execution yok.
- **CTO recommendation: GO.** Sınırlar #190/#191/#145 ile tutarlı; PR-2b-A tek
  sorumluluğu production `/api/v1` authority evidence olarak sabitlenir.

## Split strategy

- **PR-2b-A (bu paket):** production `/api/v1` routing authority evidence.
- **PR-2b-B (öneri, bu pakette değil):** #145 frontend runtime binding / P0 E2E
  release gate reconciliation — #185 close-ready olduktan sonra.
- **PR-2b-C (öneri, bu pakette değil):** Backend AC9 regression disposition /
  tenant-local occurrence-date çalışması — observation PASS'inden bağımsız
  kod/regresyon hattı.

## Authority boundary

### Routing authority

- Yetki kaynağı yalnız gözlenen deployment'ın Vercel metadata'sıdır:
  `deploymentCommitSha = expected_head_sha` VE
  `deploymentCommitSource = vercel_deployment_metadata` zorunludur.
- SHA eşleşmesi tek başına yetki vermez: gözlenen host, deployment URL veya
  alias listesine metadata ile bağlanmalıdır
  (`targetBaseUrl`/`productionAlias`/`productionDeploymentUrl` host binding).
- Static hosted kontratlar (`/runtime`, `/`, `/demo`, `/full-vision`) `/api/v1`
  authority ispatına katkı vermez.

### Deployment identity fields

- `expected_head_sha` (workflow `expected_head_sha` girişi)
- `targetBaseUrl` (production target URL)
- `productionAlias`
- `productionDeploymentUrl`
- `productionDeploymentId`
- `deploymentCommitSha` + `deploymentCommitSource` (Vercel metadata)
- `deploymentMetadataStatus` (PASS)
- `observationTimestamp`
- artifact name / `reportContentDigest` (+ GitHub artifact id/name/digest)

### PASS identity rules

- `deploymentCommitSha` = `expected_head_sha` (STALE_DEPLOYMENT fail-closed)
- `deploymentCommitSource` = `vercel_deployment_metadata` VE
  `deploymentMetadataStatus` = PASS
- Target URL host, deployment metadata yetkili host kümesinde
  (DEPLOYMENT_TARGET_MISMATCH fail-closed)
- `/runtime`, `/runtime/app.js`, `/`, `/demo`, `/full-vision` PASS
- `/api/v1/health` Nest-controlled JSON (`status=ok`,
  `service=okul-yonetim-saas-api`, `applicationType=backend-api`)
- `protectedPreview = false`; static HTML / Vercel NOT_FOUND / uncontrolled
  JSON yok
- Artifact ID/name/digest mevcut; artifact head SHA = expected head SHA
- Security/KVKK redaction onaylı
- Not: Vercel `readyState` alanı enforcement'da ayrıca okunmaz; deployment
  identity, commit SHA + metadata host binding + metadata status üzerinden
  doğrulanır (observe-production-runtime.js / wp07f-production-observation.yml)

### FAIL identity rules (literal failureReasons — observe-production-runtime.js taksonomisi)

- `/api/v1` üzerinde static HTML / Vercel NOT_FOUND / uncontrolled JSON →
  `API_UNREACHABLE` = FAIL (normal observation)
- `PROTECTED_PREVIEW_BLOCKED` = FAIL
- `UNEXPECTED_STATUS` / `HEADER_MISMATCH` / `OBSERVATION_CHECK_FAILED` /
  `REQUEST_TIMEOUT` = FAIL
- `STALE_ARTIFACT_HEAD_MISMATCH` / `STALE_DEPLOYMENT` = FAIL; kullanım yasak
  (no-close)
- `DEPLOYMENT_METADATA_AUTH_FAILED` / `DEPLOYMENT_METADATA_UNAVAILABLE` /
  `DEPLOYMENT_METADATA_TIMEOUT` / `DEPLOYMENT_COMMIT_SHA_MISSING` /
  `DEPLOYMENT_TARGET_MISMATCH` / `MISSING_DEPLOYMENT_LOOKUP` /
  `MISSING_DEPLOYMENT_METADATA_AUTH` / `MISSING_EXPECTED_PR_HEAD_SHA` /
  `SCRIPT_EXCEPTION` / `ARTIFACT_WRITE_FAILURE` = FAIL
- `API_UNREACHABLE` = EXPECTED FAIL (yalnız izole self-test: failureReasons
  tam olarak [`API_UNREACHABLE`], checks tam olarak
  [`deliberate unreachable api self-test`], overallStatus = FAIL)

### Stale deployment rejection (architecture blocker)

- PASS yalnızca SHA + metadata host binding iki koşulu birden sağlanırsa atanır;
  tek koşul → `STALE_DEPLOYMENT`/`DEPLOYMENT_METADATA_*` fail.
- Draft aşaması blocker yok; execution öncesi Vercel deployment metadata erişimi
  ve secret authority CEO checkpoint'i gerekir.

## Kapsam

- Exact-head expected SHA kaydı (draft zamanı head: `754b0db`; execution
  sırasında workflow `expected_head_sha` girişiyle yeniden doğrulanır)
- Production target URL / deployment URL / deployment ID / alias alanları
  kaydı (observation-identity.json sözleşmesi: productionDeploymentUrl,
  productionDeploymentId, productionAlias, targetBaseUrl, deploymentCommitSha,
  deploymentCommitSource=vercel_deployment_metadata)
- /api/v1/health veya known endpoint controlled JSON proof
- Static HTML / Vercel NOT_FOUND / uncontrolled JSON rejection
- Protected-preview redirect rejection (PROTECTED_PREVIEW_BLOCKED)
- Normal production observation artifact identity planı
  (artifact ID/name/digest, reportContentDigest)
- Isolated API_UNREACHABLE self-test artifact identity planı
- Security/KVKK artifact redaction checklist
- #185 closure evidence matrix

## Kapsam dışı

- PR-2b-B (frontend runtime binding / P0 E2E release gate) — ayrı paket
- PR-2b-C (Backend AC9 regression disposition) — ayrı paket
- #190 browser reproducibility implementation
- #191 governance constitution
- Attendance implementation
- Parent Notification implementation
- SMS/e-mail/WhatsApp delivery
- AI Team Console runtime coupling
- new dashboard
- fake API
- fake PASS
- production PII fixture
- branch creation
- workflow/deploy trigger

## Acceptance criteria

- [ ] Draft PR body + acceptance matrix hazır (bu PR)
- [ ] Evidence checklist PENDING alanları execution öncesi doldurulacak
- [ ] Exact-head production observation PASS (execution — CEO checkpoint sonrası)
- [ ] Known /api/v1 endpoint Nest-controlled JSON proof (execution)
- [ ] Normal + isolated self-test artifact identity kaydı (execution)
- [ ] Security/KVKK redaction PASS (execution)
- [ ] #185/#145 no-close guardrails ihlali yok

## Test çıktısı

- Planning-only scope guard: PASS (draft paket; runtime kod yok, workflow
  trigger yok — execution bu PR'a ait değildir, ayrı yetki gerektirir)
- Changed files (önerilen, execution-time): docs + .github workflow +
  observation artifacts referansları; runtime diff yok
- Runtime code: none (planning only)
- Migration: none
- Ruleset change: none
- Workflow run referansları: execution sonrası doldurulacak
  (wp07f-production-observation run ID, artifact ID/name/digest)

## Evidence checklist

(Detaylı PENDING tablosu: PROMPT 4 — Trust & Quality çıktısına gömülüdür;
body'de aynı tablo kullanılır.)

## Security/KVKK checklist

- [ ] No raw secret logs
- [ ] No Authorization header logs
- [ ] No cookie logs
- [ ] No raw backend body
- [ ] No raw stack trace
- [ ] No production PII fixture
- [ ] No parent/guardian contact data
- [ ] No notification payload
- [ ] Artifact metadata allowlist uygulanacak
- [ ] Sanitized redirect location only
- (Tam liste: PROMPT 5 — Security/KVKK)

## Rollback

- Draft paket: rollback yüzeyi yok (dosya yok, diff yok).
- Execution sonrası: production-reachability PR merge commit revert
  (api/v1/index.ts, api/v1/[...path].ts, vercel.json,
  scripts/observe-production-runtime.js, scripts/build-hosted-demos-static.js,
  scripts/test-hosted-demos-static-deployment.js,
  .github/workflows/wp07f-production-observation.yml,
  docs/wp-07/production-reachability-observation.md, package.json).
- Detaylı plan: PROMPT 6 — Release Governance.

## Reviewer/check matrix

(Detay: PROMPT 7 — Reviewer / Check Matrix; body'ye özet tablo gömülür:
PR Governance 4 check, CodeRabbit/Qodo current-head, Scanner, GitGuardian,
Independent current-head APPROVED, Merge Governance.)

## CEO authority checkpoint

- **Draft için: NOT REQUIRED** (planning only; dosya/diff yok).
- **Execution için: REQUIRED LATER** — production observation,
  deployment/metadata authority, Vercel protection authority kullanımı,
  workflow dispatch veya secret-bearing işlemlerden ÖNCE zorunlu.

## Architecture blockers

- **Draft:** blocker yok.
- **Execution öncesi:** Vercel deployment metadata erişimi ve secret
  authority CEO checkpoint'i gerekir.
- **Stale deployment reddi:** SHA + metadata host binding iki koşulu birden
  sağlanmadan PASS asla atanmaz (STALE_DEPLOYMENT fail-closed).

## #185/#145 no-close guardrails

- #185 yalnız: exact-head production observation PASS + Nest-controlled
  JSON proof + normal/self-test artifact ID/name/digest + Security/KVKK
  PASS + Backend AC9 disposition + stale-artifact yok koşullarında.
- #145 yalnız: #185 close-ready = YES + fresh merged-main runtime evidence
  + Teacher/Ops journey reconciliation + KVKK diagnostics PASS + no fake
  API + no stale artifact koşullarında.
- Bu PR hiçbir issue'yu otomatik kapatmaz.

## Issue reference

Refs #185
Refs #145
Fixes (yok — hiçbir issue kapatılmaz)

<!-- GOVERNANCE SEMANTIC GATE: PLANNING ONLY / NO EXECUTION / NO ISSUE CLOSE / NO MERGE -->
