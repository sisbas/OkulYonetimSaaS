# Merge Governance Standard

Bu standart PR #71 ve PR #78 sonrası görülen erken merge riskini tekrar edilemez hale getirmek için uygulanır.

## Korunacak branch'ler

- `main`
- `backend`
- `release/*`

## Zorunlu branch protection / ruleset ayarları

- Require a pull request before merging: **enabled**
- Required approving reviews: **1**
- Dismiss stale pull request approvals when new commits are pushed: **enabled**
- Require review from Code Owners: **enabled**, CODEOWNERS tanımlandıktan sonra
- Require conversation resolution before merging: **enabled**
- Require status checks to pass before merging: **enabled**
- Require branches to be up to date before merging: **enabled**
- Restrict who can push to matching branches: **enabled**
- Allow force pushes: **disabled**
- Allow deletions: **disabled**
- Do not allow bypassing the above settings: **enabled**
- Admin bypass: **disabled unless explicitly approved and logged**

## Required status checks

Aşağıdaki check adları branch protection / repository ruleset içinde birebir required yapılmalıdır:

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

## PR body zorunlu alanları

Aşağıdaki alanlar boş, placeholder veya anlamsız olursa `PR Governance` workflow'u fail olur:

- Amaç
- Kapsam
- Kapsam dışı
- Acceptance criteria
- Test çıktısı
- KVKK/audit etkisi
- Rollback
- CI run referansı

## Draft kuralı

`Draft`, `Taslak` veya `WIP` sadece PR gövdesine yazılamaz. PR henüz merge-ready değilse GitHub'ın gerçek draft metadata'sı kullanılmalıdır.

## GitHub CLI ile manuel ruleset kontrol komutu

Connector branch protection/ruleset mutasyonu desteklemediğinde repo admini aşağıdaki kontrolleri GitHub UI veya `gh api` ile uygulamalıdır:

```bash
# Required check adlarını doğrula
# Settings → Rules → Rulesets veya Settings → Branches → Branch protection rules

# Ana hedef:
# main/backend üzerinde merge butonu yalnız tüm required checks success olduğunda açık kalmalıdır.
```

## Rollback

Bu governance değişikliği CI/merge akışını kilitlerse geçici geri dönüş sırası:

1. Hatalı required check adı tespit edilir.
2. Branch protection/ruleset required check listesi düzeltilir.
3. Workflow dosyası revert edilmez; önce required check adı ve workflow job adı eşitlenir.
4. Kritik üretim kilidi varsa yalnız repo sahibi onaylı ve kayıt altına alınmış geçici bypass kullanılır.

## Test planı

- Eksik PR body ile test PR açılır; `PR Governance / Body Validation` fail olmalıdır.
- Issue referansı olmayan PR açılır; `PR Governance / Issue Reference` fail olmalıdır.
- Rollback planı `yok` olan PR açılır; `PR Governance / Rollback Plan` fail olmalıdır.
- Açık review thread bırakılır; merge butonu kapalı kalmalıdır.
- Approval sonrası yeni commit push edilir; eski approval düşmelidir.
- Dummy secret içeren branch açılır; `GitGuardian scan` veya `Sensitive Pattern Scanner` fail olmalıdır.
