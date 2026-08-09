# WP-07F PR-2a: Browser runner reproducibility salvage for #185

## Amaç

Issue #185 kapsamındaki browser E2E runner reproducibility boşluğunu kapatmak: `@sparticuz/chromium` ve `puppeteer-core` bağımlılıklarını exact pin'e kilitlemek, P0 browser E2E workflow'unu `npm ci`-only'ye taşımak, browser launch stratejisini sparticuz-only yapmak ve jest/.gitignore hijyenini sağlamak. PR-2a, yalnızca browser runner reproducibility salvage'dir; #185/#145 closure iddiası taşımaz (closure hattı PR-2b'dir).

Refs #185
Refs #145

## Kapsam

- `package.json` / `package-lock.json`: `@sparticuz/chromium "138.0.2"`, `puppeteer-core "24.16.0"` exact pin (main'deki `^` range yerine).
- `.github/workflows/wp07f-p0-browser-e2e.yml`: `npm ci`-only, locked browser deps doğrulaması (runner chromium args mirror), sparticuz smoke launch.
- `scripts/qa-p0-browser-e2e.js`: `resolveChromiumLaunchCandidates`/`resolveChromiumLaunchOptions` sparticuz-only (`!== 'sparticuz'` fail; `/usr/bin/chromium`/build-system candidate silindi).
- `test/runtime-integration/browser-runner-reproducibility.spec.ts`: exact pin + no `npm install --no-save` + no apt + sparticuz strategy + smoke assert.
- `jest.config.js`: `testPathIgnorePatterns ['/node_modules/','/dist/','/.worktrees/']`.
- `.gitignore`: `+.worktrees/`.
- `docs/rag/190-evidence-ledger.md`, `docs/security/pr2-security-kvkk-review.md`, `docs/rag/190-pr2b-body-draft.md`: kanıt kayıtları.
- `PR_BODY.md`: bu body.

## Kapsam dışı

- `vercel.json`, `api/v1/*`, `/api/v1` reachability, production observation (PR-2b).
- #185/#145 closure claim, AC9 backend regression, frontend runtime closure.
- Attendance, Parent Notification, SMS/e-mail/WhatsApp, dashboard expansion.
- Fake API / fake success state / production PII fixture.
- `.specify/memory/constitution.md` (governance belgesi — ayrı PR #191).

## Acceptance criteria

- [x] `@sparticuz/chromium` ve `puppeteer-core` exact pin (package.json + package-lock, root + node_modules).
- [x] P0 browser E2E workflow `npm ci`-only; `npm install --no-save`/apt-get chromium yok.
- [x] Workflow locked browser deps doğrulaması runner chromium args'ı ile birebir mirror.
- [x] `qa-p0-browser-e2e.js` sparticuz-only; sistem chromium fallback'i yok.
- [x] `browser-runner-reproducibility.spec.ts` ekli ve geçiyor.
- [x] jest `.worktrees/`/`dist/` ignore; `.gitignore` `.worktrees/` içeriyor.
- [x] Constitution scope drift yok (#191'e ayrıldı, diff'te yok).
- [x] Local runtime-integration PASS 30/30 — head `47327ca` (doc-only sonrası geçerli).
- [x] Local unit PASS — head `47327ca` (doc-only sonrası geçerli).
- [x] Security/KVKK: PASS (manuel audit, `docs/security/pr2-security-kvkk-review.md`).
- [x] Güncel head `3985859` CI run seti PASS (Backend CI, DB Smoke, Gate 1, Sprint 1 QGate, P0 E2E, scanner, GitGuardian — §Test çıktısı).
- [ ] PR Governance / Acceptance Criteria PASS — FAILED: ready PR + 3 unchecked AC maddesi (fail-closed, beklenen; maddeler tamamlanınca rerun).
- [ ] Merge Governance Enforcement PASS — PENDING (AC FAIL + independent approval yok).
- [ ] CodeRabbit güncel head disposition — STALE (son review @ `8eb9eb6`; `3985859` doc-only delta kapsanmadı).
- [ ] Güncel head SHA için en az bir bağımsız APPROVED review — PENDING (0 valid; 1 DISMISSED @ `2881985`).

## Test çıktısı

Güncel head `3985859` (canlı GitHub API, 2026-08-07):

- Local runtime-integration: **PASS 30/30** — `6dc192b` working tree'de doğrulandı; doc-only commit'ler sonrası geçerli (ledger E16, §10).
- Local unit: **PASS 194/194** (36 suite) — head `47327ca`'da koşuldu; doc-only commit'ler sonrası geçerli.
- **Current-head CI @ `3985859`:** Backend CI `93245220499` ✅; DB Smoke `93245220524` ✅; Gate 1 CI `93245220738` ✅; Sprint 1 Quality Gate `93245220566` ✅; P0 browser E2E `93245220715` ✅ + artifact `9038098139` (name `wp07f-p0-browser-e2e-3985859...`, head `3985859` — **CURRENT_HEAD**; digest auth download gerekli, PENDING); Sensitive Pattern Scanner `93245220433` ✅; GitGuardian `93245220345`/`93245216212`/`93245225817` ✅.
- PR Governance @ `3985859`: Body Validation `93245312622` ✅, Rollback Plan `93245312606` ✅, Issue Reference `93245312587` ✅, **Acceptance Criteria `93245312596` FAILED** (ready PR + unchecked AC — beklenen). Merge Governance Enforcement `93245332109`: in_progress (beklenen FAIL: AC + approval yok).
- Geçmiş head kanıtları (historical, current-head PASS değil): run `30996686864` @ `59e5302` (ledger E1); matrix run `31109208974` + artifact `8970943986` digest `sha256:b8ba7c59...` @ `2881985` (QA matrix, `docs/rag/185-acceptance-evidence-matrix.md` §1 — ledger §2'den ayrı evidence).
- Security/KVKK: PASS (manuel audit `514c0bb`).

> Not: Canlı GitHub PR body'si (2026-08-07 itibarıyla) hâlâ `2881985` current-head iddiası ve eski run seti taşıyor (STALE); bu dosya güncel body taslağıdır. Token ile canlıya yansıtılacak (ledger §12).

## KVKK/audit etkisi

Kişisel veri, öğrenci, veli, guardian, personel, notification payload veya gerçek production verisi etkilenmez. PR-2a ve PR-2b kapsamında üretilen tüm log ve artifact dosyaları manuel olarak denetlenmiş; token, cookie, credential, raw request/response body, öğrenci/veli/guardian PII veya notification payload barındırmadıkları doğrulanmıştır. Detaylı bulgular [pr2-security-kvkk-review.md](docs/security/pr2-security-kvkk-review.md) altında raporlanmıştır.

Security/KVKK: PASS

## Rollback

Regresyon görülürse PR merge commit'i `git revert <merge_commit_sha>` ile geri alınır. Browser runner bağımlılıkları eski `^` range'e döndürülür (lockfile revert). Runtime rollback, migration down, database restore, veri düzeltmesi veya feature flag gerekmez.

## CI run referansı

- Güncel head `3985859`:
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245220499 (Backend CI)
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245220524 (DB Smoke)
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245220738 (Gate 1 CI)
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245220566 (Sprint 1 Quality Gate)
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245220715 (P0 browser E2E + artifact `9038098139`)
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245312622 (PR Gov / Body Validation)
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245312596 (PR Gov / Acceptance Criteria — FAILED, beklenen)
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/93245332109 (Merge Governance Enforcement — in_progress)
- Geçmiş head (historical, current-head değil):
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30996686864
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/31109208974

## Karar

Security/KVKK: PASS

<!-- GOVERNANCE SEMANTIC GATE: TECHNICAL PASS / CURRENT-HEAD CI PASS / MERGE GOVERNANCE PENDING / INDEPENDENT APPROVAL HOLD / MERGE NOT AUTHORIZED UNTIL AGGREGATE SUCCESS -->
