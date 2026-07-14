# GitGuardian Setup

`GitGuardian scan` workflow'unun required check olarak çalışması için repository secret gereklidir.

## Gerekli secret

- Name: `GITGUARDIAN_API_KEY`
- Scope: repository secret

## Uygulama

1. GitGuardian dashboard üzerinden CI token üretin.
2. GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret.
3. `GITGUARDIAN_API_KEY` değerini ekleyin.
4. `GitGuardian scan` check'ini branch protection/ruleset içinde required yapın.

## Kabul kriteri

Secret eksikse veya açık secret bulgusu varsa `GitGuardian scan` fail olmalıdır. Bu durumda PR merge edilmemelidir.
