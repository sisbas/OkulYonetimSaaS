# Required Checks Activation Checklist

Bu dosya merge governance PR'ı merge edildikten sonra repo admini tarafından yapılacak ayarları listeler.

## Required check adları

Branch protection veya repository ruleset içinde aşağıdaki adlar birebir kullanılmalıdır:

```text
PR Governance / Body Validation
PR Governance / Issue Reference
PR Governance / Rollback Plan
PR Governance / Acceptance Criteria
Sprint 1 Quality Gate
Backend CI
DB Smoke
Gate 1 CI
Sensitive Pattern Scanner
GitGuardian scan
```

## Uygulama sırası

1. `GITGUARDIAN_API_KEY` repository secret olarak eklenir.
2. Bu PR merge edilir.
3. `main` için ruleset veya branch protection açılır.
4. `backend` branch'i aktif kullanılacaksa aynı required checks oraya da uygulanır.
5. Required review count `1` yapılır.
6. Stale approval dismissal açılır.
7. Conversation resolution required yapılır.
8. Direct push kapatılır.
9. Force push ve branch deletion kapatılır.
10. Admin bypass kapatılır veya yalnız emergency bypass olarak ayrı loglanır.

## Doğrulama

- Eksik PR body merge'i engelliyor mu?
- Issue reference yoksa merge engelleniyor mu?
- Rollback zayıfsa merge engelleniyor mu?
- Approval sonrası yeni commit approval'ı düşürüyor mu?
- Açık review thread varken merge engelleniyor mu?
- Dummy secret scan'i fail ediyor mu?

## Kabul kriteri

Merge butonu yalnızca tüm required check'ler `success`, en az bir geçerli review mevcut ve tüm review thread'leri resolved olduğunda kullanılabilir kalmalıdır.
