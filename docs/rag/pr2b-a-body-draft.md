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

## Kapsam

- Exact-head expected SHA kaydı (draft zamanı head: `71afdd4`; execution
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

CEO checkpoint is NOT required for draft package preparation.
CEO checkpoint IS required before any production observation, deployment
authority execution, Vercel metadata/protection authority use, workflow
dispatch, or secret-bearing operation.

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
