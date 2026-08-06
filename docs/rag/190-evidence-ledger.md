# WP-07F — PR #190 Evidence Ledger (Agentic RAG Operations)

Source-bound, evidence-based decision record. Güncellenmez push'den sonra; append-only karar için Notion token sonrası `docs/rag/` altında yürütülür.

- **Active head SHA:** `1d94a68` (repair rebase sonrası — browser salvage head; evidence bu head üzerinde yeniden toplanmalı)
- **PR #190:** `wp07f-pr2a-browser-salvage` (eski adı `wp07f-pr2-production-closure`) — open / draft=true / mergeable=true
- **Canonical source:** GitHub live API + CTO comment (sisbas, 2026-08-05T10:30:51Z) > Notion (MCP kuruldu, `NOTION_TOKEN` yok → `ACCESS_BLOCKED`, GitHub-canonical).

## 1. Canonical state

| Kaynak | Durum |
|---|---|
| #190 | open, draft, mergeable; title `Wp07f pr2 production closure` (TITLE_OVERCLAIM); body template boş, `Fixes #` ile bitsin (BODY_TEMPLATE_REMAINS / FIXES_USED_WHERE_REFS_REQUIRED). **Repair (rebase sonrası):** branch `wp07f-pr2a-browser-salvage`, scope = browser runner salvage only |
| #185 | open (qa-kvkk-required, acceptance-evidence) |
| #145 | open (parent #139; depends #141-144; #185 kapanınca kapanır) |
| #42 | open / Attendance HOLD |
| #183 | open / Parent Notification planning-only HOLD |
| #186 | CLOSED/MERGED — observation tool + workflow + spec (`observe-production-runtime.js`, `wp07f-production-observation.yml`) |
| #187 | CLOSED/NOT MERGED — ama çoğu main'e girip `qa-p0-browser-e2e.js` sparticuz-only. Kalan salvage: **exact pin** (main'de `^` range; #190'de exact). |
| #188 | CLOSED/NOT MERGED — içerik #186 ile **süperseded** (protected-preview, API_UNREACHABLE, self-test). Salvage = kapsam doğrulaması. |
| #189 | CLOSED/NOT MERGED — `tools/ai-team-console`; **closure PR'ına dahil değil.** |

## 2. Evidence ledger (head 59e5302)

| id | item | source | run_id | conclusion | head_match | usable_for_PR2a | usable_for_185_close |
|---|---|---|---|---|---|---|---|
| E1 | P0 Browser E2E | wp07f-p0-browser-e2e.yml | 30996686864 | SUCCESS | 59e5302 ✅ | ✅ | ❌ |
| E2 | Browser artifact | upload-artifact | 8926474450 (digest sha256:9f56e4288b36e3d7796feea07932766998a5f44bd807a8778b80f0233cc6ee8f) | overallStatus=PASS | 59e5302 ✅ | ✅ | ❌ |
| E3 | Backend CI | backend-ci | 30996686945 | SUCCESS | 59e5302 ✅ | ctx | ❌ |
| E4 | DB Smoke | db-smoke | 30996686773 | SUCCESS | 59e5302 ✅ | ctx | ❌ |
| E5 | Gate 1 CI | gate1 | 30996686773 | SUCCESS | 59e5302 ✅ | ctx | ❌ |
| E6 | Sprint1 QGate | sprint1-quality-gate | 30996686922 | SUCCESS | 59e5302 ✅ | ctx | ❌ |
| E7 | Sensitive Pattern Scanner | sensitive-pattern-scanner | 30996686796 | SUCCESS | 59e5302 ✅ | ✅ | ❌ |
| E8 | GitGuardian (x3) | gitguardian | 30996686864/788 | SUCCESS | 59e5302 ✅ | ✅ | ❌ |
| E9 | Vercel preview | Vercel | — | ready | — | ctx (non-prod) | ❌ |
| E10 | PR Governance x4 (+ merge enforcement) | pr-governance | 30996686835 | **FAILURE** | 59e5302 ✅ | ❌ (merge blocked) | ❌ |
| E11 | CodeRabbit | coderabbitai[bot] | — | **skipped (draft)** | 59e5302 ✅ | ❌ | ❌ |
| E12 | Reviews | GitHub API | — | 0 submitted | — | ❌ (approval yok) | ❌ |
| E13 | `/api/v1/health` probe (preview) | CTO comment | — | **200 text/html (FAIL)** | preview | ❌ | ❌ |
| E14 | Production observation (exact-head) | — | — | **MISSING** | — | ❌ | ❌ |
| E15 | API reachability (Nest JSON) | — | — | **UNPROVEN** | — | ❌ | ❌ |

## 3. #190 = #187 salvage? (doğrulandı — patch)

- `package.json`: `@sparticuz/chromium "^138.0.2" → "138.0.2"`, `puppeteer-core "^24.16.0" → "24.16.0"` ✅ exact pin
- `package-lock.json`: root + node_modules aynı exact pin ✅
- `jest.config.js`: `testPathIgnorePatterns ['/node_modules/','/dist/','/.worktrees/']` ✅
- `.gitignore`: `+.worktrees/` ✅
- `wp07f-p0-browser-e2e.yml`: `npm install --no-save` + `apt-get install chromium` → `npm ci`-only + `node --input-type=module` smoke (`puppeteer.launch`/`chromium.executablePath`) ✅
- `qa-p0-browser-e2e.js`: `resolveChromiumLaunchCandidates` (multi-candidate) → `resolveChromiumLaunchOptions` (sparticuz-only; `!== 'sparticuz'` fail; sil `/usr/bin/chromium`/`buildSystemChromiumCandidate`) ✅
- `browser-runner-reproducibility.spec.ts` (add): exact pin + no no-save + no apt + sparticuz strategy + smoke asserts ✅

## 4. Contradictions (flag list)

`TITLE_OVERCLAIM`, `BODY_TEMPLATE_REMAINS`, `FIXES_USED_WHERE_REFS_REQUIRED`, `CI_PARTIAL_SUCCESS` (functional SUCCESS, governance FAILURE), `CODERABBIT_SKIPPED` (draft), `NO_INDEPENDENT_APPROVAL` (0 reviews), `API_REACHABILITY_UNPROVEN` (`/api/v1/health` → 200 text/html), `PRODUCTION_OBSERVATION_MISSING`, `EXACT_HEAD_FUTURE_RISK` (PR-2b observation head eşleşmesi).

**Resolved by repair (rebase):** `SCOPE_DRIFT` (`.specify/memory/constitution.md`, governance doc — PR-2b dışı) — constitution `wp07f-governance-constitution` branch'ine taşındı, PR #190 diff'inden çıkarıldı.

## 5. Missing evidence (next gates)

- PR-2a: düzeltilmiş title `WP-07F PR-2a: Browser runner reproducibility salvage for #185`, body (Kapsam/Kapsam dışı/Refs/Rollback/Evidence/KVKK/CI), `Refs #185` / `Refs #145` (sadece `Fixes` YOK), `.specify/memory/constitution.md` → ayrı governance PR (`wp07f-governance-constitution`). ✅ constitution ayrıldı.
- PR-2a: PR Governance x4 + Merge Enforcement PASS; CodeRabbit current-head review (draft dışından sonra); ≥1 independent approval.
- PR-2b: `/api/v1/health` → Nest JSON (`content-type: application/json`, `{status:ok, service:'okul-yonetim-saas-api', applicationType:'backend-api'}`); `vercel.json` + `api/v1/*` routing delta.
- #185: AC9 regression (tenant-local occurrence-date, multi-branch own-read), frontend tab/state evidence, production observation exact-head PASS (apiReachabilityStatus=PASS).
- Notion: karar log (token sonrası append-only).

## 6. Dependency graph (kritik yol)

C1 repair → C2 Gov PASS → C3 CodeRabbit → C4 independent approval → C5 PR-2a merge
**paralel:**
C6 PR-2b routing → C7 `/api/v1/health` Nest JSON → C8 AC9 ∧ C9 frontend → C10 production obs exact-head → C11 #185 → C12 #145

```mermaid
flowchart TD
  C1["#190 repair"] --> C2["Gov PASS"]
  C2 --> C3["CodeRabbit current-head"]
  C3 --> C4["Independent approval"]
  C4 --> C5["PR-2a merge"]
  C6["PR-2b routing proof"] --> C7["/api/v1 health Nest JSON"]
  C7 --> C8["Backend AC9"]
  C7 --> C9["Frontend runtime closure"]
  C8 --> C10["Production obs exact-head"]
  C9 --> C10
  C10 --> C11["#185 close-ready"]
  C11 --> C12["#145 close-ready"]
  C5 -.->|enable trust only| C11
```

## 7. Decision

- **#190 → PR-2a (browser salvage).** Evidence PASS (E1-E2), ama merge `BLOCKED` (E10-E12). Repair sonra merge.
- **#185/#145 kapanışı = PR-2b sonrası.** `API_REACHABILITY_UNPROVEN` + `PRODUCTION_OBSERVATION_MISSING`.
- **Scope dışı:** `vercel.json`/`api/v1/*`, AC9, frontend runtime, observation identity — hiçbiri #190'da.
- **Guardrail:** merge/PR-ready/#185/#145 kapanışı YOK; Notion/ops sadece append-only.

## 8. GitHub update draft (CTO uygulamalı)

- PR #190 title: `WP-07F PR-2a: Browser runner reproducibility salvage for #185`
- Label: `draft`, `merge-blocked`, `PR2A`, `needs-governance-repair`, `Refs #185 / Refs #145`
- Body: Kapsam=7 dosya (#187 salvage + hijyen), Kapsam dışı=vercel.json/api/v1/AC9/frontend/observation/PR-2b/constitution, Evidence=E2 artifact/digest + E1 run 30996686864, KVKK=no PII, Rollback=lockfile revert, CI=E10-12 durumu.
- `.specify/memory/constitution.md`: `wp07f-governance-constitution` branch'i hazır (sadece constitution) → ayrı PR.
- PR-2b draft aç: `WP-07F PR-2b: production /api/v1 reachability for #185`.

Not: Bu dosya sadece **dokümantasyon** (implementation/merge/workflow trigger yok).
