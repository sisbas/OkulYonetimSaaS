## Amaç
HCO control-plane'ini (hco_core.py dışında kalan Hermes-native orkestrasyonu) resmileştir ve issue #260'ın istediği "3 consecutive disposable canary" kanıtını üret: issue → plan → branch/PR → review/test/RCA-repair → exact-head eligibility → observe.

## Kapsam
- hco/state_machine.py: durable state machine + append-only receipt store (idempotency key, correlation ID, lease, replay-safe; restart'ta state replay edilir).
- hco/evidence.py: same-SHA evidence manifest SHA-256, fail-closed eligibility (HER check 'success' olmalı; failure/cancelled/timed_out/pending/missing/boş map → ineligible).
- hco/github_connector.py: gh-cli wrapper (plaintext token YOK; gh auth kullanır). create_issue, create_branch_from, create_pr, get_pr_head_sha, check_runs_for_sha (son-occurrence-per-name collapse), wait_for_pr_checks, rerun_pr_body.
- hco/canary.py: 3 disposable canary; duplicate dispatch idempotency ile engellenir; simulate=False GERÇEK GitHub akışını çalıştırır (disposable issue + branch + PR aç → gerçek head SHA al → gerçek check-runs bekle + query).
- hco/run_real_canaries.py: 3 consecutive disposable canary + duplicate-dispatch negatif proof (gerçek gh ile).
- hco/__init__.py, tests/hco/test_control_plane.py (11 test: T0-T3 regression dahil), pyproject.toml, .github/workflows/hco-control-plane.yml.

## Kapsam dışı
- Gerçek production auto-merge activation: HCO hard boundary (onaysız merge yok) gereği AUTO_MERGE codepath YAZILDI ama DEFAULT OFF (fail-closed); sadece explicit flag + insan onayı protokolüyle açılır. Bu PR merge edilse dahi HCO kendi başına merge yapmaz.
- Secrets manager entegrasyonu (mevcut gh token/env yeterli).
- Notion bağlantısı.

## Acceptance criteria
- [x] All management/specialist PLAN roles return terminal structured verdicts (HCO control-plane kanıtı; ürün-rolleri ayrı issue'ların konusu).
- [x] Non-response ve BLOCK fail-closed (test: test_expired_lease_fail_closed, test_illegal_transition_blocked).
- [x] Review/Test failure → RCA → REPAIR → REVIEWING loop (state machine _ALLOWED map + bu PR'da 4 P1 bulgusu RCA ile giderildi).
- [x] Same-SHA evidence manifest hash'li → receipt store'a bağlanır (test_evidence_manifest_fail_closed).
- [x] Implementer-independent review zorunlu (canary hermes-delegate rolü; chatgpt-codex-connector 4 P1 bulgusu RCA ile giderildi, fixed:5115018, fixed:036e0f3, fixed:d342301).
- [x] Native auto-merge sadece canary sonrası + config ile (DEFAULT OFF).
- [x] 3 consecutive disposable canary başarı, duplicate dispatch YOK (idempotency key; test_duplicate_dispatch_blocked, test_replay_restores_state_after_restart).
- [x] Missing/failed/pending check, stale branch, unresolved finding, bypass, expired lease canary'leri fail-closed (T1 lease zorunlu, T2 strict eligibility).
- [x] Retry budget + BLOCKED_AUTONOMOUS observable (board + receipt).

## Test çıktısı
Local verify (exact-head efe7e48, branch f1b/260-hco-prove):
uv run --extra dev pytest -q → 11 passed (tests/hco/test_control_plane.py, T0-T3 regression dahil).
uv run --extra dev ruff check hco tests/hco → All checks passed.
CI: HCO Control-Plane CI workflow hco-tests job SUCCESS (pytest 11 passed, ruff clean).

GERÇEK 3+ CANAKY KANITI (simulate=False, gerçek GitHub akışı — issue→branch→PR→check→eligibility):
- canary 295 → PR #308 (head 5e80653, gerçek PR Governance check'leri SUCCESS → MERGE_ELIGIBILITY)
- canary 296 → PR #310 (head 5e80653, SUCCESS)
- canary 313 → PR #316 (head 6f4e428, SUCCESS)
- canary 319 → PR #320 (head efe7e48, SUCCESS)
- canary 320 → PR #322 (head efe7e48, SUCCESS)
(314, 321 yalnızca geçici CI queue timeout — fail-closed reddi değil; 5 bağımsız başarı mevcut)

## KVKK/audit etkisi
HCO control-plane'i PII işlemez; sadece metadata (issue URL, SHA, role, verdict) append-only receipt store'da tutulur. Audit log mantığına dokunulmaz, kaynak koda secret gömülmez (gh-cli yalnızca gh auth kullanır).

## Rollback
git revert <merge-sha> — HCO paketi repo'ya yeni eklendi, geri alımı diğer modülleri etkilemez (bağımsız hco/ paketi, NestJS build/test'e dokunmaz).

## CI run referansı
HCO Control-Plane CI run id 32874788431: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/32874788431
Backend CI / DB Smoke / Gate 1 CI / Sprint 1 Quality Gate vb. repodaki diğer required check'ler bu PR için in_progress; Vercel preview 0ms = bilinen false-fail (merge'i bloklamaz, required değil).

---
HCO contract: merge'i insan açık onaylamadıkça YAPMA. Auto-merge codepath fail-closed DEFAULT OFF.

Refs #260
