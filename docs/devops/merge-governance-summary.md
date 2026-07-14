# Merge Governance Implementation Summary

## Branch

`ops/merge-governance-lock`

## Değişiklik özeti

- PR body validation workflow eklendi.
- Required check adları normalize edildi.
- GitGuardian workflow'u eklendi.
- Sensitive pattern scanner eklendi.
- Gate 1 CI workflow'u eklendi.
- PR template zorunlu alanlara göre yenilendi.
- Branch protection/ruleset uygulama dokümanları eklendi.

## Required checks

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

## Kalan manuel ayar

GitHub branch protection/ruleset ayarları GitHub UI üzerinden uygulanmalıdır. Bu connector oturumunda branch protection mutasyonu yoktur.
