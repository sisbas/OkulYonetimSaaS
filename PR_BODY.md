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
- [x] Local runtime-integration PASS 30/30 — güncel head `47327ca`.
- [x] Local unit PASS — güncel head `47327ca`.
- [x] Security/KVKK: PASS (manuel audit, `docs/security/pr2-security-kvkk-review.md`).
- [ ] Güncel head `47327ca` için CI run'ları (Backend CI, DB Smoke, Gate 1, Sprint 1 QGate, scanner, GitGuardian) — PENDING (draft).
- [ ] PR Governance x4 + Merge Governance Enforcement PASS — PENDING (draft).
- [ ] CodeRabbit güncel head disposition — PENDING (draft sonrası).
- [ ] Güncel head SHA için en az bir bağımsız APPROVED review — PENDING.

## Test çıktısı

Güncel head `47327ca` (2026-08-07, CTO reconciliation):

- Local runtime-integration: **PASS 30/30** (serverless-bootstrap, production-observation, browser-runner-reproducibility) — güncel head'de yeniden doğrulandı (ledger E16).
- Local unit: **PASS 194/194** (36 suite) — güncel head'de yeniden koşuldu.
- Güncel head CI: **PENDING** — PR draft; run'lar draft→ready sonrası toplanacak.
- Geçmiş head kanıtları (historical, current-head PASS değil): run `30996686864` @ `59e5302` (E1 P0 Browser E2E SUCCESS); run `31109208974` + artifact `8970943986` digest `sha256:b8ba7c59...` @ `2881985` (matrix PASS).
- Security/KVKK: PASS (manuel audit `514c0bb`).

## KVKK/audit etkisi

Kişisel veri, öğrenci, veli, guardian, personel, notification payload veya gerçek production verisi etkilenmez. PR-2a ve PR-2b kapsamında üretilen tüm log ve artifact dosyaları manuel olarak denetlenmiş; token, cookie, credential, raw request/response body, öğrenci/veli/guardian PII veya notification payload barındırmadıkları doğrulanmıştır. Detaylı bulgular [pr2-security-kvkk-review.md](docs/security/pr2-security-kvkk-review.md) altında raporlanmıştır.

Security/KVKK: PASS

## Rollback

Regresyon görülürse PR merge commit'i `git revert <merge_commit_sha>` ile geri alınır. Browser runner bağımlılıkları eski `^` range'e döndürülür (lockfile revert). Runtime rollback, migration down, database restore, veri düzeltmesi veya feature flag gerekmez.

## CI run referansı

- Geçmiş head (historical, current-head değil):
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30996686864
  - https://github.com/sisbas/OkulYonetimSaaS/actions/runs/31109208974
- Güncel head `47327ca` CI run'ları: PENDING — run ID'ler draft→ready sonrası eklenecek.

## Karar

Security/KVKK: PASS

<!-- GOVERNANCE SEMANTIC GATE: TECHNICAL PASS (LOCAL EVIDENCE) / CURRENT-HEAD CI PENDING / INDEPENDENT APPROVAL HOLD / MERGE NOT AUTHORIZED UNTIL READY + AGGREGATE SUCCESS -->
