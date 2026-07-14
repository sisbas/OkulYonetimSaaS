# GitGuardian Setup

`GitGuardian scan` workflow'unun required check olarak çalışması için repository secret gereklidir.

## Gerekli secret

- Name: `GITGUARDIAN_API_KEY`
- Scope: repository secret
- Location: GitHub Actions secrets

## Uygulama

1. GitGuardian dashboard üzerinden CI token üretin.
2. GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret.
3. Secret adını tam olarak `GITGUARDIAN_API_KEY` girin.
4. Secret değerine GitGuardian CI tokenını kaydedin.
5. `GitGuardian scan` check'ini branch protection/ruleset içinde required yapın.

## Doğrulama

- Secret eklendikten sonra yeni bir workflow event'i ile doğrulama yapılır.
- `Validate GitGuardian configuration` adımı PASS olmalıdır.
- Ardından gerçek `GitGuardian scan` adımı çalışmalıdır.
- Secret değeri workflow loglarına yazdırılmaz; yalnız boş/dolu kontrolü yapılır.
- Organization veya environment secret kullanılıyorsa repository erişimi/job environment eşleşmesi ayrıca doğrulanmalıdır.

## Kabul kriteri

- `Validate GitGuardian configuration`: PASS
- `GitGuardian scan`: PASS veya gerçek secret bulgusu nedeniyle FAIL
- Secret eksikliği, yanlış isim veya yanlış scope durumunda preflight FAIL
- Açık secret bulgusu varsa PR merge edilmemelidir.

## Doğrulama kaydı

14 Temmuz 2026 tarihinde `GITGUARDIAN_API_KEY` eklendiği bildirildi. Tarihsel PR run'ı yeniden çalıştırıldığında preflight hâlâ secret'ı boş gördüğü için temiz `main` tabanlı doğrulama PR'ı ile yeni workflow event'i başlatıldı. Bu kayıt secret değerini içermez.
