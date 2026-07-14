# Stale Approval Policy

Stale approval dismissal aktif olmalıdır.

## Kural

PR approve edildikten sonra yeni commit push edilirse önceki approval geçersiz sayılmalıdır.

## Gerekçe

Approval sonrası eklenen commit review kapsamı dışında kalabilir. Bu durum erken veya kontrolsüz merge riskini artırır.

## Kabul kriteri

Yeni commit sonrası en az bir geçerli review yeniden alınmadan merge butonu kullanılabilir kalmamalıdır.
