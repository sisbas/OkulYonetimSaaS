# No PASS Without Evidence

Belirsiz CI sonucu PASS kabul edilmez.

## Kural

PR body veya final comment içinde her required check için açık run reference ve success kanıtı bulunmalıdır.

## Geçerli kanıt

- GitHub Actions run URL
- Run ID
- Check adı + completed/success durumu

## Geçersiz kanıt

- `baktık sorun yok`
- `muhtemelen geçti`
- `CI iyi görünüyor`
- boş veya placeholder test çıktısı
