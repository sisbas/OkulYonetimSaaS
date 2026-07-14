# Direct Push Policy

`main`, `backend` ve `release/*` branch'lerine direct push kapalı olmalıdır.

## Gerekçe

Direct push açık kalırsa PR governance, required review, stale approval dismissal, review thread resolution, GitGuardian ve Sensitive Pattern Scanner süreçleri atlanabilir.

## İstisna

İstisna yalnız acil üretim kesintisi durumunda, emergency bypass log ile ve sonrasında hotfix PR açılarak kullanılabilir.

## Kabul kriteri

Korunan branch'lerde tüm değişiklikler PR üzerinden geçmelidir.
