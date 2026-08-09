# WP-07F PR-2b: production /api/v1 reachability for #185

> Taslak. `gh` ve Vercel secret'ları (VERCEL_PROTECTION_BYPASS_SECRET, VERCEL_DEPLOYMENT_METADATA_TOKEN, VERCEL_TEAM_ID) bu ortamda yok; bu yüzden production observation run'ı buradan tetiklenemez. PR açıldıktan sonra `docs/rag/190-evidence-ledger.md` §8'e göre CTO/gov sahibi workflow'u çalıştırır ve run URL/ID ile bu bölümü doldurur.

## Amaç

Issue #185 kapsamındaki production API reachability boşluğunu kapatmak: Vercel production deployment'ında `/api/v1/health` ve seçili `/api/v1/*` endpointlerinin Nest tarafından yönetilen JSON response ürettiğini exact-head observation ile kanıtlamak. Routing ve observation altyapısı PR #186 (merge `35950f0`) ile main'de olduğu için bu PR, production'da exact-head observation PASS (`apiReachabilityStatus=PASS`) üretir.

Refs #185
Refs #145

## Kapsam

- `api/v1/index.ts`, `api/v1/[...path].ts` serverless Nest bootstrap — main'de mevcut; PR bu branch üzerinden production'a gider.
- Global `/api/v1` prefix (`app.setGlobalPrefix('api/v1')`) + ValidationPipe(whitelist, forbidNonWhitelisted).
- `scripts/observe-production-runtime.js` + `.github/workflows/wp07f-production-observation.yml` ile exact-head production observation.
- Env failure sınıflaması: `MISSING_ENVIRONMENT`, `INSECURE_TARGET_PROTOCOL`, `API_UNREACHABLE`, `PROTECTED_PREVIEW_BLOCKED`, `REQUEST_TIMEOUT`, `STALE_DEPLOYMENT`, `DEPLOYMENT_METADATA_*`.
- No-PII artifact: redaction (`redact`/`redactUrl`/`redactPathname`), health response PII regex ile doğrulanmış, secret asla artifact'ta serialize edilmez.
- Rollback plan (aşağıda).

## Kapsam dışı

- Attendance, Parent Notification, SMS/email/WhatsApp, dashboard expansion.
- Fake API, fake success state.
- Backend AC9 regression (ayrı), frontend runtime closure (ayrı).
- #190 (PR-2a browser salvage) içeriği — ayrı PR.

## Acceptance criteria

- [ ] `/runtime` ve `/runtime/app.js` 200 + CSP/security header'ları korunur.
- [ ] `/`, `/demo`, `/full-vision` 200/307/308 korunur.
- [ ] `/api/v1/health` → 200 `content-type: application/json`, body `{status:'ok', service:'okul-yonetim-saas-api', applicationType:'backend-api', ...}`.
- [ ] Static HTML, Vercel NOT_FOUND, protected-preview redirect veya uncontrolled JSON PASS sayılmaz.
- [ ] Exact-head production observation PASS: `commitSha` = `deploymentCommitSha` = `EXPECTED_PR_HEAD_SHA`; `deploymentMetadataStatus=PASS`; `apiReachabilityStatus=PASS`.
- [ ] Observation artifact'ta PII/secret yok.
- [ ] Rollback plan hazır.

## Test çıktısı

- Local runtime-integration: `npm.cmd run test:runtime-integration` → **PASS 30/30** (3 suite: serverless-bootstrap, production-observation, browser-runner-reproducibility) — ledger E16.
- Health controller spec: no-PII (JSON serialize edilmiş yanıtta `/email|phone|token|password|credential/i` eşleşmesi yok) — PASS.
- Exact-head production observation: PENDING — workflow `wp07f-production-observation.yml` Vercel secret'ları ile çalıştırılır; run ID/URL aşağıya eklenecek.

## KVKK/audit etkisi

Kişisel veri, öğrenci, veli, guardian, personel, notification payload veya gerçek production verisi etkilenmez. Observation yalnızca metadata ve health JSON okur; artifact redaksiyonlu olup `reportContentDigest` ile içerik bütünlüğü ve kimliği sabitlenir. Hiçbir secret, token, cookie, veya PII artifact dosyalarına yazılmaz veya loglanmaz.

Security/KVKK: PASS (Manuel audit başarıyla tamamlanmıştır. Rapor: docs/security/pr2-security-kvkk-review.md)

## Rollback

- PR merge commit'i `git revert <merge_commit_sha>` ile geri alınır.
- Vercel production: deployment rollback (önceki production deployment'ına geri dön) — `/api/v1/*` statik değilse davranış eski deployment kimliğine döner.
- Database migration, data düzeltmesi veya feature flag gerekmez.
- Observation workflow tamamen pasif (yalnızca `workflow_dispatch`), üretim trafiğini etkilemez.

## CI run referansı

- Local runtime-integration PASS (E16): `npm.cmd run test:runtime-integration`.
- Exact-head production observation run: PENDING — `<run_url_veya_run_id>` workflow üzerinden, `expected_head_sha` = PR head SHA.

## Karar

Security/KVKK: PASS

<!-- GOVERNANCE SEMANTIC GATE: TECHNICAL SCOPE CONFIRMED / PRODUCTION OBSERVATION PENDING / MERGE NOT AUTHORIZED UNTIL EXACT-HEAD OBSERVATION PASS -->
