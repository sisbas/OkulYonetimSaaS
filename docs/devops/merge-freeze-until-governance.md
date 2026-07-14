# Merge Freeze Until Governance

Governance PR merge edilip branch protection/ruleset required checks aktifleşmeden M2 runtime/frontend kapsamındaki yeni PR'lar merge edilmemelidir.

## Donma kapsamı

- Room runtime
- Course runtime
- TimeSlot runtime
- StudentGroup runtime
- Frontend core definitions
- KVKK/audit etkisi olan değişiklikler

## Çözülme koşulu

- Required checks aktif.
- GitGuardian secret mevcut.
- Branch protection/ruleset doğrulandı.
- Test PR ile merge button kapalı kalma davranışı kanıtlandı.
