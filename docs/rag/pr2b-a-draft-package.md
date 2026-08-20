# WP-07F — PR-2b-A Draft PR Package (PLANNING ONLY)

> Bu paket, CTO dispatch'i (2026-08-09) uyarınca PR-2b (production `/api/v1` reachability for #185) için **draft package hazırlığıdır**. İçerik yalnızca planlama/dokümantasyondur; hiçbir uygulama, branch, workflow/merge tetiklemesi, issue kapatma veya secret kullanımı içermez.
>
> Kaynaklar: `docs/rag/190-evidence-ledger.md` (§1–12), `docs/rag/190-pr2b-body-draft.md`, `docs/security/pr2-security-kvkk-review.md`, `docs/security/pr2b-a-security-kvkk-review.md`, `docs/wp-07/production-reachability-observation.md`, `docs/devops/merge-governance-standard.md`, `.github/workflows/wp07f-production-observation.yml`, `vercel.json`, canlı GitHub PR #190 metadata (ledger §12 snapshot).

## 0. Dispatch kaydı & sınırlar

- **Karar:** GO — PR-2b-A draft package hazırlığı (PLANNING ONLY).
- **Bağlayıcı sınırlar:** #190 = MERGED/CLOSED (merge `a85fab3`, 2026-08-09T14:16:00Z; closure claim yok) · #191 = HOLD · PR-2b-A = PLANNING ONLY · Keystone = TASK ROUTING / PLANNING ONLY.
- **Records:** GitHub #167 comment `5232108708` (dispatch kaydı) · GitHub #185 comment `5232109995` (closure hattı yalnız planlanır) · Notion WP-07 (09.08.2026 17:47 TRT, CTO Task Assignment).
- **Bu pakette asla uygulanmaz:** implementation · branch creation · workflow/deploy trigger · merge · mark-ready · issue close · secret use · GitHub/Notion mutation (yetki yok) · reviewer request · check trigger · observation execution.

## Paket haritası (teams sıralı, deliverable → bölüm)

| # | Team | Deliverable | Bölüm |
|---|---|---|---|
| 1 | Repository Governance | Draft PR Body | §1 (kaynak: `190-pr2b-body-draft.md`) |
| 2 | Architecture & Platform | Acceptance Matrix | §2 |
| 3 | Backend & Data / Trust & Quality | Evidence Checklist | §3 |
| 4 | Security/KVKK | Security/KVKK Checklist | §4 |
| 5 | Release Governance | Rollback Plan | §5 |
| 6 | Reviewer / Check Matrix | Reviewer/Check Matrix | §6 |
| 7 | Executive / CEO | CEO Authority Checkpoint | §7 |
| 8 | Release Governance | No-Close Guardrails | §8 |
| 9 | Product / Keystone | Task-Routing Cards | §9 |
| 10 | CTO | Final Synthesis | §10 |

---

## 1. Draft PR Body (deliverable 1)

Canonical draft: **`docs/rag/190-pr2b-body-draft.md`** (mevcut, bu paketin parçası).

- **Başlık önerisi:** `WP-07F PR-2b: production /api/v1 reachability for #185`
- **Refs:** `Refs #185` / `Refs #145` (yalnızca `Refs` — `Fixes`/closure claim YOK).
- **Amaç:** Vercel production deployment'ında `/api/v1/health` ve seçili `/api/v1/*` endpointlerinin Nest JSON response üretmesini **exact-head observation** ile kanıtlamak. Routing altyapısı main'de mevcut (PR #186, merge `35950f0`); PR-2b bunu production'da kanıtlar (ledger §5).
- **Kapsam dışı (pakette teyit):** Attendance, Parent Notification, SMS/email/WhatsApp, dashboard; fake API/success state; backend AC9 regression (ayrı hat); frontend runtime closure (ayrı hat); #190 (PR-2a) içeriği; #191 constitution.
- **Governance gate (body sonu):** `TECHNICAL SCOPE CONFIRMED / PRODUCTION OBSERVATION PENDING / MERGE NOT AUTHORIZED UNTIL EXACT-HEAD OBSERVATION PASS`.
- **Açılış durumu:** PR açma (GitHub mutation) bu pakette **uygulanmaz**; body bu haliyle hazırdır, ayrı yetki ile açılır (Keystone K1, §9).

## 2. Acceptance Matrix (deliverable 2)

Kaynak: body draft AC 1–7 + observation identity contract (`docs/wp-07/production-reachability-observation.md` §2) + workflow contract.

| AC | Kriter | Kanıt kaynağı | Durum | Gate |
|---|---|---|---|---|
| AC-1 | `/runtime` ve `/runtime/app.js` 200 + CSP/security header'ları korunur | observation checks (`verify:hosted-demos`, `observe:production-runtime`) | PLANNED → PENDING | PR-2b run |
| AC-2 | `/`, `/demo`, `/full-vision` 200/307/308 korunur | observation checks | PLANNED → PENDING | PR-2b run |
| AC-3 | `/api/v1/health` → 200 `content-type: application/json`, body `{status:'ok', service:'okul-yonetim-saas-api', applicationType:'backend-api', ...}` | E13 (preview `text/html` FAIL) → routing sonrası production probe (E15) | **UNPROVEN** → PENDING | PR-2b run |
| AC-4 | Static HTML, Vercel NOT_FOUND, protected-preview redirect veya uncontrolled JSON **PASS sayılmaz** | workflow contract (overallStatus FAIL kuralları) | PLANNED (contract hazır) | PR-2b run |
| AC-5 | Exact-head: `commitSha` = `deploymentCommitSha` = `EXPECTED_PR_HEAD_SHA`; `deploymentMetadataStatus=PASS`; `deploymentCommitSource=vercel_deployment_metadata`; `apiReachabilityStatus=PASS`; `overallStatus=PASS` | `wp07f-production-observation.yml` enforcement step | PENDING (E14) | PR-2b run |
| AC-6 | Observation artifact'ta PII/secret yok | redaction (`redact`/`redactUrl`/`redactPathname`), `reportContentDigest`, scanner PASS | PASS (statik doğrulama, `pr2-security-kvkk-review.md`) + PENDING (run-time artifact re-check) | run-time |
| AC-7 | Rollback plan hazır | §5, `190-pr2b-body-draft.md` §Rollback, `docs/wp-07` §Rollback | PASS (hazır) | — |

**Head riski (ledger §4 `EXACT_HEAD_FUTURE_RISK`):** AC-5, PR-2b head'i PR açılışında sabitlenmeden PASS olamaz. `expected_head_sha` = PR-2b head SHA, observation dispatch anında pin edilir; head sonra değişirse `STALE_DEPLOYMENT`/`DEPLOYMENT_METADATA_*` sınıflaması devreye girer (K2, §9).

## 3. Evidence Checklist (deliverable 3)

Canonical Backend & Data karar kaydı: **`docs/rag/pr2b-a-backend-data-authority-matrix.md`** (API Authority Matrix — Karar: GO; bu paketin parçası). Aşağıdaki checklist satırları bu kaynağın kontrat/mapping kuralına göre sabitlenir; known route kataloğunun kodla çapraz doğrulaması execution öncesi (K2) yapılır.

| ID | Kanıt | Kaynak | Durum |
|---|---|---|---|
| E13 | `/api/v1/health` preview probe → 200 text/html FAIL (routing öncesi; routing main'e girdi) | ledger §2, CTO comment | HISTORICAL — başarı kanıtı değil |
| E14 | **Production exact-head observation** (commitSha/deploymentCommitSha eşleşmesi, `apiReachabilityStatus=PASS`) | `wp07f-production-observation.yml` dispatch + artifact | **MISSING — PR-2b'nin tek kapatıcı kanıtı** |
| E15 | API reachability (Nest JSON) production kanıtı | E14 artifact | **UNPROVEN** |
| E16 | Local runtime-integration PASS 30/30 (3 suite) | `npm run test:runtime-integration` | PASS (context; PR-2b head'inde re-run zorunlu) |
| E17 | API Authority Matrix karar kaydı (Karar: GO; controlled JSON contract, forbidden response/failure mapping, tenant/branch regression, fixture policy, rollback yüzeyi) | `docs/rag/pr2b-a-backend-data-authority-matrix.md` | PASS (planning) — known route katalog cross-validation execution öncesi |
| CI-01…08 | Backend CI · DB Smoke · Gate 1 CI · Sprint 1 QGate · P0 E2E (+artifact) · Sensitive Pattern Scanner · GitGuardian | PR-2b head CI run seti | PENDING (PR-2b branch head'inde koşulur) |
| CI-09…12 | PR Gov: Body Validation · Issue Reference · Rollback Plan · Acceptance Criteria | `pr-governance.yml` | PENDING (PR-2b head'inde; AC-1..7 unchecked → beklenen FAIL, fail-closed) |
| REV-01 | CodeRabbit current-head review | PR #190'da STALE (`8eb9eb6` → `3985859`); PR-2b'de **current-head** olmalı | PENDING |
| REV-02 | ≥1 independent APPROVED review (current head) | PR #190'da 0 valid | PENDING |
| ART-01 | Observation artifact reconciliation (identity JSON + upload artifact id/name/digest/url + auth download sonrası digest kaydı) | named `actions/upload-artifact` step outputs + closure evidence summary | PENDING |

**Notlar:** Historical run'lar (E1 `30996686864`, matrix `31109208974` @ `2881985`) PR-2b için **current-head PASS sayılmaz** (ledger §11). P0 E2E artifact `9038098139` digest kaydı (auth download) PR-2a hattında PENDING'dir, PR-2b'yi beklemez.

## 4. Security/KVKK Checklist (deliverable 4)

Canonical karar kaydı: **`docs/security/pr2b-a-security-kvkk-review.md`** (16 maddelik checklist — **Karar: GO**; bu paketin parçası). Temel konvansiyon: `docs/security/pr2-security-kvkk-review.md` (manuel audit, **PASS** — `514c0bb`).

### Security checklist (16 madde, tamamı ✅)

| # | Kontrol | Sonuç |
|---|---|---|
| S-1 | No raw secret logs (workflow env'leri loglanmaz) | PASS |
| S-2 | No Authorization header logs | PASS |
| S-3 | No cookie logs | PASS |
| S-4 | No raw backend body (yalnız contract alanları) | PASS |
| S-5 | No raw stack trace | PASS |
| S-6 | No production PII fixture | PASS |
| S-7 | No parent/guardian contact data | PASS |
| S-8 | No notification payload | PASS |
| S-9 | No guidance/free-text PII | PASS |
| S-10 | Artifact metadata allowlist tanımlı | PASS |
| S-11 | Sanitized redirect location only (`PROTECTED_PREVIEW_BLOCKED`'ta yalnız sanitize location) | PASS |
| S-12 | Protected-preview PASS olamaz | PASS |
| S-13 | Static HTML PASS olamaz | PASS |
| S-14 | Vercel NOT_FOUND PASS olamaz | PASS |
| S-15 | Uncontrolled JSON PASS olamaz | PASS |
| S-16 | Scanner/GitGuardian tek başına Security/KVKK PASS sayılmaz | PASS |

### KVKK checklist

- Veli/eğitmen/öğrenci kişisel verisi işlenmez; gözlem yalnız public endpoint yanıt kontratına dokunur.
- Artifact redaksiyonu execution sonrası manual audit ile doğrulanır (PR-2a `pr2-security-kvkk-review.md` konvansiyonu).

### Allowed artifact fields

- `observation-identity.json` sözleşme alanları: `commitSha`, `expectedHeadSha`, `branchRef`, `productionDeploymentId`, `productionDeploymentUrl`, `productionAlias`, `targetBaseUrl`, `observationTimestamp`, `artifactName`, `reportContentDigest`, `deploymentCommitSha`, `deploymentCommitSource`, `deploymentMetadataLookup`, `deploymentMetadataStatus`, `deploymentTargetHost`, `deploymentAuthorizedHosts`, `apiReachabilityStatus`, `overallStatus`, `failureReasons`, `checks[]`, `identityChecks`
- Sanitized-only fields: redirect location, `error`; status/content-type; contract JSON key names. Raw request/response bodies remain forbidden.

### Forbidden artifact fields

- Secret/token/cookie/Authorization header değerleri; raw response body, raw stack trace; parent/guardian iletişim verisi, notification payload, free-text PII; `artifactDigest` (rapor içinde rezerve)

### Redaction requirements & secret boundary

- Vercel metadata/protection authority kullanımında secret değerler log/artifact'a geçemez; yalnız PASS/FAIL durumu kaydedilir; redirect location yalnız sanitize formda.
- `VERCEL_DEPLOYMENT_METADATA_TOKEN`, `VERCEL_PROTECTION_BYPASS_SECRET`, `VERCEL_AUTOMATION_BYPASS_SECRET` yalnız execution'da ve CEO checkpoint sonrası kullanılabilir; **draft bu secret'lara dokunmaz**.

### PASS rule & blocking risks

- **PASS kuralı:** 16 checklist maddesi + redaksiyon audit'i + artifact allowlist uyumu; scanner'lar ek kanıt, tek başına PASS değil.
- **Blocking:** execution'da raw body/stack trace sızıntısı → quarantine + escalation (PROMPT 6 triage); protected preview'in PASS'a çevrilmesi → mimari ihlal, no-close.

### CEO checkpoint & CTO recommendation

- **CEO checkpoint:** REQUIRED LATER (secret/metadata/protection authority); NOT REQUIRED FOR DRAFT.
- **CTO recommendation:** **GO** — checklist PR-2a konvansiyonu ve KVKK testleri (`kvkk/` suite) ile tutarlı; draft aşamasında secret kullanılmadı.

**Gate:** Security/KVKK GO (manuel audit mevcut); PR-2b run-time artifact re-check (E14 artifact indirilip PII/secret taraması) execution sonrası manuel audit ile yeniden teyit edilir (S-8 açık kalem). Production observation yalnızca metadata + health JSON okur (pasif, `workflow_dispatch`-only).

## 5. Rollback Plan (deliverable 5)

**Karar (Release Governance): GO** — kayıt: PROMPT 6, 2026-08-09. CTO recommendation: GO; no-close guardrails issue state'ini değiştirmez, yalnız gelecekteki closure için fail-closed koşul tanımlar. Blocked actions respected: YES.

### 5.1 Rollback plan

- **Draft paket:** rollback gerekmez (diff yok).
- **Execution sonrası regresyon:** production-reachability merge commit `git revert <merge_commit_sha>`; revert yüzeyi: `api/v1/index.ts`, `api/v1/[...path].ts`, `vercel.json`, `scripts/observe-production-runtime.js`, `scripts/build-hosted-demos-static.js`, `scripts/test-hosted-demos-static-deployment.js`, `.github/workflows/wp07f-production-observation.yml`, `docs/wp-07/production-reachability-observation.md`, `package.json`.
- **Bounded revert:** routing/observation evidence değişikliği varsa revert surface yalnız bu dosyalar ile sınırlı; migration/db restore/feature flag yok.
- **Vercel production:** önceki production deployment'ına rollback (deployment kimliği geri döner) — `/api/v1/*` davranışı eski deployment'a döner.
- **Gerekmez:** DB migration, veri düzeltmesi, feature flag.
- **Observation pasifliği:** workflow yalnızca `workflow_dispatch`; üretim trafiğine dokunmaz. Protected-preview'da PASS üretemez (`PROTECTED_PREVIEW_BLOCKED`).
- **Doğrulama:** revert sonrası `/api/v1/health` davranışı ve statik route'lar (AC-1/AC-2) smoke ile kontrol edilir.

### 5.2 Deployment rollback decision tree

- **observation FAIL + deploy hatası** → deployment geri alınmaz; önce triage.
- **Gözlenen davranış bozukluğu doğrulanırsa** → Vercel önceki READY deployment'a rollback, sonra merge commit revert.
- **Metadata doğrulaması başarısız** → deployment rollback değil, no-close.

### 5.3 Failure-handling rules

- **Artifact mismatch** (head SHA uyuşmazlığı / stale artifact) → no-close; artifact yeniden üretilir, kanıt olarak kullanılmaz.
- **Protected-preview blocked** → no-close; CEO checkpoint + protection authority triage.
- **API_UNREACHABLE** → Backend/Architecture triage (deployment state, region, Vercel function logu, alias binding); no-close.
- **Security/KVKK leak** → artifact quarantine + escalation, no-close, redaksiyon sonrası yeniden gözlem.

### 5.4 Rollback surfaces

- Execution hattı dosyaları (§5.1 revert yüzeyi)
- GitHub Actions artifact alanı (leak'ta quarantine)
- Issue state (değişmez — no-close)

## 6. Reviewer / Check Matrix (deliverable 6)

**Karar (Reviewer / Check Matrix): GO** — PROMPT 7, 2026-08-09. CTO recommendation: GO;
matrix, PR-2a review konvansiyonuyla aynı; hiçbir review/check tetiklenmedi
(draft aşaması planning-only; PR yok → check trigger yetkisi yok). Blocked actions respected: YES.

### Reviewer matrix (planning kaydı — tetiklenmedi)

| Alan | Konu | Kaynak |
|---|---|---|
| Repository Governance | PR body completeness · Refs #185/#145 (Fixes yok) · rollback plan · no-close guardrails | §1, §5, §8, body draft |
| Architecture | routing authority (metadata-bound, exact-head) · deployment identity alanları · stale deployment rejection | body draft §Authority boundary |
| Backend | controlled JSON proof · tenant/branch safety · AC9 regression disposition | `pr2b-a-backend-data-authority-matrix.md` + PR-2b-C |
| Frontend | runtime journey dependency status (#145 bağımlılık durumu) · #145 no-close dependency | PR-2b-B (ayrı paket) |
| Trust & Quality | observation artifact identity (ID/name/digest) · PASS/FAIL classification · stale artifact rejection | body draft §PASS/FAIL identity rules |
| Security/KVKK | redaction · artifact allowlist · PII/secret leak prevention | `pr2b-a-security-kvkk-review.md` (16 madde PASS) |
| Executive/CEO | production observation authority only (checkpoint) | §7 (REQUIRED LATER) |

### Check matrix (planlama; tetiklenmedi)

| Check | Durum |
|---|---|
| PR Governance / Body Validation | PLANLAMA — tetiklenmedi |
| PR Governance / Acceptance Criteria | PLANLAMA — tetiklenmedi |
| PR Governance / Rollback Plan | PLANLAMA — tetiklenmedi |
| PR Governance / Issue Reference | PLANLAMA — tetiklenmedi |
| CodeRabbit current-head review | PLANLAMA — tetiklenmedi |
| Qodo current-head review | PLANLAMA — tetiklenmedi |
| Sensitive Pattern Scanner | PLANLAMA — tetiklenmedi |
| GitGuardian | PLANLAMA — tetiklenmedi |
| Independent current-head APPROVED review | PLANLAMA — tetiklenmedi |

### Required before Ready

- Body/AC/Rollback/Issue Reference PASS (draft→ready geçişi)
- Execution sonrası evidence alanları dolu; CEO checkpoint kaydı var

### Required before merge

- Current-head CI set PASS (observation execution sonrası)
- CodeRabbit + Qodo current-head disposition PASS
- Scanner + GitGuardian PASS (ek kanıt; tek başına Security/KVKK PASS değil)
- En az bir bağımsız current-head APPROVED review
- CEO authority checkpoint kaydı (production observation kapsamında)

### CEO authority checkpoint

- Draft/review matrisi: NOT REQUIRED
- Production observation/deployment authority: REQUIRED LATER

Kaynak: `docs/devops/merge-governance-standard.md` (required checks) + ledger §12.

**Required status checks (PR-2b merge öncesi hepsi PASS):**

| Check | Sorumlu | Durum planı |
|---|---|---|
| PR Governance / Body Validation | Gov workflow | PENDING (body hazır → açılışta) |
| PR Governance / Issue Reference | Gov workflow | PENDING (`Refs #185/#145` mevcut) |
| PR Governance / Rollback Plan | Gov workflow | PENDING (plan hazır §5) |
| PR Governance / Acceptance Criteria | Gov workflow | PENDING (AC-1..7 tamamlanınca; fail-closed beklenen) |
| Sprint 1 Quality Gate | CI | PENDING |
| Backend CI | CI | PENDING |
| DB Smoke | CI | PENDING |
| Gate 1 CI | CI | PENDING |
| Sensitive Pattern Scanner | CI | PENDING |
| GitGuardian scan | CI | PENDING |
| P0 Browser E2E | CI (context) | PENDING |
| WP-07F Production Observation | **dispatch-only, required check değil** | PENDING — CEO/gov sahibi yetkisi |

**Reviewer'lar:**

| Reviewer | Rol | PR-2b koşulu |
|---|---|---|
| CodeRabbit | otomatik | current-head review (PR #190'daki `8eb9eb6` → STALE deseni tekrarlanmamalı) |
| Qodo | otomatik | current-head disposition |
| Independent human | merge için zorunlu | ≥1 valid APPROVED, current head SHA'da (yeni commit → approval düşer, `dismiss stale` kuralı) |

**Semantik kurallar:** `Fixes` yerine `Refs` (kapanış iddiası yok) · draft metadata gerçek `draft` flag'i ile (body'ye "draft" yazılmaz) · merge yalnız aggregate success + approval sonrası.

## 7. CEO Authority Checkpoint Statement (deliverable 7)

```
PR-2b-A Draft Package — CEO authority checkpoint

KAPSAM (bu paket):
- Draft PR body, acceptance matrix, evidence checklist, Security/KVKK checklist,
  rollback plan, reviewer/check matrix, no-close guardrails, task-routing kartları.
- PLANNING ONLY: hiçbir mutation/trigger/merge/close içermez.

CEO ONAYI GEREKMEZ:
- Draft package hazırlığı ve yayımlanması (BU PAKET).

CEO ONAYI / YETKİSİ GEREKLİ (İLERİDE):
- Production observation execution (Vercel secret'ları: VERCEL_PROTECTION_BYPASS_SECRET,
  VERCEL_AUTOMATION_BYPASS_SECRET, VERCEL_DEPLOYMENT_METADATA_TOKEN, VERCEL_TEAM_ID).
- PR açılışı / mark-ready / deployment authority.
- Merge authorization (aggregate success + approval sonrası).

Kural: Bu paket, yukarıdaki "ileride" kalemlerine hiçbir ön yetki veya
implicit authority VERMEZ. Her biri ayrı yetkilendirilir ve kayıt altına alınır.
```

## 8. #185 / #145 No-Close Guardrails (deliverable 8)

**Karar (Release Governance): GO** — PROMPT 6 kaydı ile tamamlandı; koşullar aşağıda fail-closed sabitlenmiştir.

### #185 closure koşulları (tamamı zorunlu)

- PR-2b-A exact-head production observation PASS
- Known `/api/v1` endpoint Nest-controlled JSON proof mevcut
- Normal observation artifact ID/name/digest kayıtlı
- İzole self-test artifact ID/name/digest kayıtlı
- Security/KVKK PASS reconcile edilmiş
- Backend AC9 disposition kayıtlı
- Stale artifact kullanılmıyor

### #145 closure koşulları (tamamı zorunlu)

- #185 close-ready = YES
- Fresh merged-main runtime evidence mevcut
- Teacher + Operations Manager journey evidence reconcile edilmiş
- Security/KVKK diagnostics PASS
- Fake API yok; stale artifact yok

### 8.1 Triage matrix

| Durum | Triage | Sonuç |
|---|---|---|
| Artifact mismatch | QA + Release Governance | no-close; yeniden üretim |
| Protected-preview blocked | Architecture + Security; CEO checkpoint | no-close |
| API_UNREACHABLE (normal) | Backend + Architecture | no-close |
| API_UNREACHABLE (self-test) | beklenen FAIL | contract PASS |
| Secret/PII leak | Security quarantine + escalation | no-close |
| Deployment bozuk | deploy rollback tree (§5.2) | merge revert yalnızca kanıtlı |

### 8.2 Follow-up issue conditions

- Observation PASS ancak AC9 disposition eksik → PR-2b-C ayrılır
- #185 close-ready ama #145 journey evidence eksik → PR-2b-B ayrılır
- Vercel metadata erişim sorunu → infrastructure follow-up issue

### 8.3 Rule set (değişmez)

| Guardrail | Kural |
|---|---|
| #185 closure | **YASAK** — E14 exact-head observation PASS (`apiReachabilityStatus=PASS`) + AC9 backend regression (tenant-local occurrence-date, multi-branch own-read) + frontend tab/state evidence tamamlanmadan. |
| #145 closure | **YASAK** — #185 close-ready olmadan kapanmaz (parent #139, depends #141–144). |
| Body dili | PR-2b body'de `Fixes #185` / `Closes` YOK; yalnızca `Refs`. Closure claim ayrı bir evidence pack'tir (K3). |
| Title/etiket | Closure etiketi (`closed`/`done` vb.) veya #185/#145 üzerinde durum mutation'ı yok. |
| #190 | MERGED/CLOSED (merge `a85fab3`; HOLD değil; #185/#145 closure claim yok). |
| Notion | Yalnızca append-only karar log (token sonrası); mutation yok. |
| Ops | `workflow_dispatch`-only observation; merge enforcer ve ruleset'in fail-closed davranışı korunur. |

## 9. Keystone Task-Routing Cards (deliverable 9 — yalnızca kart, uygulama yok)

| Kart | Görev | Authority | Blocker | Durum |
|---|---|---|---|---|
| K1 | PR-2b PR açılışı (body §1 ile; head pin) | CEO/gov (mutation yetkisi) | CEO checkpoint | **PLANNING ONLY** |
| K2 | Production observation dispatch (E14): `target_base_url`, `production_alias`, `expected_head_sha`=PR-2b head; secret'lar repo'da | CEO + CTO | Vercel secret'ları | **PLANNING ONLY** |
| K3 | #185 closure evidence pack (E14 + AC9 + frontend + CI + approval) | CTO → CEO | K1+K2 sonrası | **PLANNING ONLY** |
| K4 | #145 closure (K3 sonrası) | CTO → CEO | K3 | **PLANNING ONLY** |
| K5 | #191 unhold (constitution PR) — ayrı hat | Gov | draft=false + gate PASS | **PLANNING ONLY** |
| K6 | Notion WP-07 append-only karar log | CTO (token sonrası) | NOTION_TOKEN | **PLANNING ONLY** |

Her kart için kural: bu paket yalnızca routing kaydıdır; kartın aksiyonu ayrı yetkilendirme ve ayrı dispatch ister.

## 10. CTO Final Synthesis (PROMPT 9)

- **Karar:** GO — PR-2b-A draft package tamamlandı (PLANNING ONLY). Kapsam doğrulandı: routing main'de (PR #186 `35950f0`), eksik tek kanıt production exact-head observation'dur (E14/E15).
- **Keystone routing:** 8 kart (PR2BA-DRAFT-BODY · PR2BA-ARCH-AUTHORITY · PR2BA-BACKEND-JSON-AUTHORITY · PR2BA-QA-EVIDENCE-CHECKLIST · PR2BA-SECURITY-KVKK-CHECKLIST · PR2BA-ROLLBACK-NOCLOSE · PR2BA-REVIEWER-CHECK-MATRIX · PR2BA-CTO-SYNTHESIS) `evidence_ready`; registry: `docs/rag/pr2b-a-keystone-routing.md`. Bu paket, PR2BA-CTO-SYNTHESIS kartının çıktısıdır (10 bölüm derlenmiş: 9 team deliverable + CTO Final Synthesis; execution kartları CEO checkpoint'e bağlı).
- **Teknik risk:** `EXACT_HEAD_FUTURE_RISK` (AC-5) — head pin'i K2 dispatch anında yapılır; gözlemden sonra head değişirse kanıt yenilenir.
- **Güvenlik:** Security/KVKK PASS (manuel audit); run-time artifact re-check (S-8) açık kalem.
- **Merge:** NOT AUTHORIZED — PENDING (observation + current-head CI + approval).
- **Kapanış:** #185/#145 close-ready = NO (guardrail §8).
- **Bağlayıcı sınırlar korundu:** #190 MERGED/CLOSED · #191 HOLD · PR-2b-A PLANNING ONLY · Keystone routing-only. Bu pakette hiçbir mutation/trigger/merge/close/secret kullanımı yapılmadı.
- **Next synthesis trigger:** PROMPT 1–8 çıktıları (bu paket) toplandığında PROMPT 9 (bu bölüm) çalıştı. Bir sonraki dispatches: Keystone kartları (K1–K6) ayrı yetkilendirme ile.

<!-- PR-2B-A DRAFT PACKAGE: PLANNING ONLY / NO MUTATION / NO TRIGGER / NO CLOSE / NO SECRET USE -->
