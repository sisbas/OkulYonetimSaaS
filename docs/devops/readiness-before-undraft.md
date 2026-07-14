# Readiness Before Ready for Review

Bu branch gerçek GitHub draft metadata ile açılmalıdır. Ready for review durumuna alınmadan önce aşağıdaki koşullar sağlanmalıdır.

## Zorunlu koşullar

- `GITGUARDIAN_API_KEY` repository secret eklendi.
- PR body tüm zorunlu alanları gerçek kanıtla doldurdu.
- `CI run referansı` alanına ilk GitHub Actions run referansı yazıldı.
- `Backend CI` success.
- `DB Smoke` success.
- `Gate 1 CI` success.
- `Sprint 1 Quality Gate` success.
- `Sensitive Pattern Scanner` success.
- `GitGuardian scan` success.
- En az bir reviewer atanmış durumda.
- Açık review thread yok.

## Not

Sadece PR açıklamasına `taslak` yazmak yeterli değildir. GitHub draft metadata kullanılmalıdır.
