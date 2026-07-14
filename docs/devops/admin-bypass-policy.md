# Admin Bypass Policy

Admin bypass varsayılan olarak kapalıdır.

## Risk

Admin bypass açık kalırsa required checks, review ve conversation resolution kontrolleri işletilmeden merge yapılabilir. PR #71 / PR #78 sınıfı erken merge problemi tekrar edebilir.

## Kabul edilebilir istisna

Yalnız acil üretim kesintisi, güvenlik hotfix'i veya veri kaybı riski durumunda emergency bypass kullanılabilir.

## Zorunlu kayıt

Bypass kullanılırsa `docs/devops/emergency-bypass-log-template.md` alanları doldurulmalı ve post-incident audit yapılmalıdır.
