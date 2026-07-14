# Governance Validation Scenarios

Bu senaryolar merge governance değişikliğinin gerçekten fail-closed çalıştığını doğrulamak için kullanılır.

## Scenario 1 — Eksik PR body

- PR body'de `Amaç` veya `Kapsam` boş bırakılır.
- Beklenen sonuç: `PR Governance / Body Validation` fail.
- Merge butonu: kapalı.

## Scenario 2 — Issue referansı yok

- PR body'de `Fixes #...` veya `Refs #...` bulunmaz.
- Beklenen sonuç: `PR Governance / Issue Reference` fail.
- Merge butonu: kapalı.

## Scenario 3 — Rollback zayıf

- Rollback alanına yalnız `yok`, `N/A` veya `sonra` yazılır.
- Beklenen sonuç: `PR Governance / Rollback Plan` fail.
- Merge butonu: kapalı.

## Scenario 4 — Acceptance criteria zayıf

- Acceptance criteria checklist formatında değildir.
- Beklenen sonuç: `PR Governance / Acceptance Criteria` fail.
- Merge butonu: kapalı.

## Scenario 5 — PR gövdesinde taslak yazıyor ama metadata draft değil

- PR body'ye `Draft`, `Taslak` veya `WIP` yazılır fakat GitHub draft metadata kullanılmaz.
- Beklenen sonuç: `PR Governance / Body Validation` fail.
- Merge butonu: kapalı.

## Scenario 6 — Approval sonrası commit

- PR approve edilir.
- Yeni commit push edilir.
- Beklenen sonuç: eski approval dismiss edilir.
- Merge butonu: kapalı.

## Scenario 7 — Açık review thread

- Review thread açık bırakılır.
- Beklenen sonuç: conversation resolution required nedeniyle merge kapalıdır.

## Scenario 8 — Sensitive pattern

- Test branch'inde hard-coded token veya veli telefonu benzeri değer eklenir.
- Beklenen sonuç: `Sensitive Pattern Scanner` veya `GitGuardian scan` fail.
