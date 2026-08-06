## Amaç

Issue #162 kapsamındaki semantic governance boşluğunu kapatmak: Ready PR body içinde tamamlanmamış acceptance criteria veya açık merge/ready engelleyici karar varken governance'ın fail-closed davranmasını sağlamak.

Refs #162
Refs #140

## Kapsam

- `.github/workflows/pr-governance.yml` içinde semantic Acceptance Criteria kontrolü.
- Draft PR'larda unchecked acceptance maddelerine geliştirme amacıyla izin.
- Ready PR'da uzunluğundan bağımsız her unchecked checklist maddesi için FAIL.
- `## Karar`, `## Decision`, `## Durum` ve `## Status` bölümlerindeki `HOLD`, `NOT AUTHORIZED`, `UNAUTHORIZED`, `NO-GO` sinyalleri için FAIL.
- Canonical labeled governance/merge/runtime/status satırlarında blocker tespiti.
- Multiline HTML comment ve karar bölümü dışındaki fenced örneklerde false-positive engeli.
- `scripts/governance-matrix-contract.js` içinde semantic ve merge fail-closed matrix.

## Kapsam dışı

Runtime, API, entity, repository, migration, database schema, frontend, ruleset required-check listesi, approval policy, scanner policy, admin bypass ve otomatik merge değişikliği yoktur.

## Acceptance criteria

- [x] Draft PR + unchecked AC development allowed; aggregate Draft nedeniyle merge blocked.
- [x] Ready PR + unchecked AC FAIL.
- [x] Ready PR + kısa unchecked `- [ ] Docs` FAIL.
- [x] Ready PR + `MERGE: HOLD` FAIL.
- [x] Ready PR + karar bölümünde bare `HOLD` FAIL.
- [x] Ready PR + fenced karar bölümünde `MERGE NOT AUTHORIZED` FAIL.
- [x] Multiline HTML comment içindeki örnek blocker false-positive üretmiyor.
- [x] Karar bölümü dışındaki fenced örnek false-positive üretmiyor.
- [x] Historical unlabeled `HOLD` notu false-positive üretmiyor.
- [x] Missing/pending/cancelled/failed required check merge blocked.
- [x] Stale approval ve unresolved thread merge blocked.
- [x] Exact-head Governance Recovery Contract SUCCESS.
- [x] Exact-head Backend CI, DB Smoke, Gate 1, Sprint Quality ve Room Migration SUCCESS.
- [x] Exact-head scanner kontrolleri SUCCESS.
- [x] PR Governance body alt kontrolleri SUCCESS.
- [x] Çözülmemiş review thread sayısı sıfır.
- [x] Güncel head SHA için bağımsız APPROVED review.
- [x] Ready sonrası Merge Governance Enforcement SUCCESS.

## Test çıktısı

Final head `9de7454036ca5c5cf0882bcbf4983face6b70ada` üzerinde:

- Governance Recovery Contract `30221348351`: completed/success.
- Backend CI `30221348342`: completed/success.
- DB Smoke `30221348339`: completed/success.
- Gate 1 CI `30221348319`: completed/success.
- Sprint 1 Quality Gate `30221348334`: completed/success.
- Room Migration Cycle `30221348329`: completed/success.
- Sensitive Pattern Scanner `30221348335`: completed/success.
- GitGuardian scan `30221348358`: completed/success.
- Main Ruleset Admin `30221348315`: completed/success.
- PR Governance `30221348326`: expected completed/failure çünkü PR Draft ve current-head approval henüz yok.
- Body Validation, Issue Reference, Rollback Plan ve Acceptance Criteria: completed/success.
- Open review thread: `0`.

## KVKK/audit etkisi

Kişisel veri, öğrenci, veli, guardian, personel, notification payload veya gerçek production verisi etkilenmez. Değişiklikler yalnızca GitHub PR body semantic validation, check-run simulation ve governance contract test davranışını etkiler.
Buna ek olarak, PR-2a ve PR-2b kapsamında üretilen tüm log ve artifact dosyaları manuel olarak denetlenmiş; token, cookie, credential, raw request/response body, öğrenci/veli/guardian PII veya notification payload barındırmadıkları doğrulanmıştır. Detaylı bulgular [pr2-security-kvkk-review.md](file:///c:/Users/semih.isbas/Documents/Codex/2026-08-04/npx-skills-latest-add-mattpocock-skills-2/OkulYonetimSaaS/docs/security/pr2-security-kvkk-review.md) altında raporlanmıştır.

Security/KVKK: PASS

## Rollback

Regresyon görülürse PR merge commit'i `git revert <merge_commit_sha>` ile geri alınır. Runtime rollback, migration down, database restore, veri düzeltmesi veya feature flag gerekmez.

## CI run referansı

- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348351
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348342
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348339
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348319
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348334
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348329
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348335
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348358
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348315
- https://github.com/sisbas/OkulYonetimSaaS/actions/runs/30221348326

## Karar

Security/KVKK: PASS

<!-- GOVERNANCE SEMANTIC GATE: TECHNICAL PASS / CURRENT-HEAD INDEPENDENT APPROVAL HOLD / MERGE NOT AUTHORIZED UNTIL READY + AGGREGATE SUCCESS -->
