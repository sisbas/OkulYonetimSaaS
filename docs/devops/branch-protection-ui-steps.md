# Branch Protection UI Steps

GitHub connector bu oturumda branch protection/ruleset mutasyonu sağlamadığı için aşağıdaki ayarlar GitHub UI üzerinden uygulanmalıdır.

## main

1. Repository → Settings → Rules → Rulesets.
2. New ruleset → Branch ruleset.
3. Target branches: `main`.
4. Enforcement status: Active.
5. Restrict deletions: enabled.
6. Restrict updates: enabled.
7. Require linear history: opsiyonel.
8. Require a pull request before merging: enabled.
9. Required approvals: `1`.
10. Dismiss stale approvals: enabled.
11. Require conversation resolution before merging: enabled.
12. Require status checks to pass: enabled.
13. Require branches to be up to date before merging: enabled.
14. Required checks:
    - `PR Governance / Body Validation`
    - `PR Governance / Issue Reference`
    - `PR Governance / Rollback Plan`
    - `PR Governance / Acceptance Criteria`
    - `Sprint 1 Quality Gate`
    - `Backend CI`
    - `DB Smoke`
    - `Gate 1 CI`
    - `Sensitive Pattern Scanner`
    - `GitGuardian scan`
15. Block force pushes: enabled.
16. Bypass list: empty unless explicitly approved emergency role exists.

## backend

`backend` aktif branch olarak kullanılmaya devam ediyorsa aynı ruleset `backend` için de uygulanmalıdır. Aksi halde eski branch üzerinden direct push veya erken merge yolu açık kalabilir.

## Kontrol

Ayar sonrası eksik PR body içeren bir test PR açın. Merge butonu kapalı kalmalıdır.
