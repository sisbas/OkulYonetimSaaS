# Protection Ruleset Gap

Bu oturumda GitHub connector üzerinden dosya, branch ve PR işlemleri yapılabildi; ancak branch protection veya repository ruleset mutasyonu için connector fonksiyonu mevcut değildi.

## Sonuç

Workflow ve dokümantasyon branch'e işlendi. Branch protection/ruleset ayarları GitHub UI üzerinden uygulanmalıdır.

## Risk

Workflow dosyaları merge edilse bile required checks branch protection/ruleset içine eklenmezse merge butonu yine açık kalabilir.

## Kontrol maddesi

Governance PR merge edildikten sonra `docs/devops/branch-protection-ui-steps.md` ve `docs/devops/required-checks.md` uygulanmadan yeni runtime/frontend PR merge edilmemelidir.
