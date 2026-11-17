# Giriş ve 403 seti — UI kod kanıtı (#488)

Ebeveyn: #471 (Faz 1 Runtime UI mock-ups-first, ADR 0002). Bu dilim, mock-up
fazının kalan iki canlı yüzeyini (Giriş + Erişim sınırı) statik tasarım
referansından üretim koduna taşır.

## Durum tespiti (neden bu kapsam)

- `frontend/design/login.html` ve `frontend/design/403.html` (PR #512 / #511) ana
  dalda hazırdı; `#488` "mock-up'tan koda" taşıyordu.
- `#486`/`#487` kod seamleri zaten main'de: `renderRegionState` (K-40/K-41) ve
  `ROUTE_PERMISSIONS`/`canRequest` fail-closed kapısı (K-44/K-45). Bu dilim yeni
  seam eklemek zorunda kalmaz.
- `/app` giriş kabuğu (`frontend/app/ui.js` `loginView()`) ve `/app` 403
  yüzeyi (`frontend/app/ui.js` `forbidden()`) mock-up panel dilinden uzaktı
  (eskiden editorial hero + kurum alanı olmadan giriş; eski 403 metni).

## Teslim edilenler

| AC | Ne | Değişiklik |
|---|---|---|
| 1 | Login mock-up görünümü `/app` login kabuğuna aktarılır; başarılı giriş iddiası yok | `frontend/app/ui.js` `loginView()`: mock-up panel yapısı (eyebrow "Giriş", h1 "Oturum açın", alt yazı "Kurum ve şube yetkiniz oturum açıldıktan sonra sistem tarafından doğrulanır."), giriş formu (e-posta + şifre zorunlu, kurum opsiyonel), `tenantId` ile `/auth/login` gönderimi (kurum boşsa gönderim yok) |
| 2 | 403 yüzeyi erişim sınırı mesajı, fail-closed tutarlı | `frontend/app/ui.js` `forbidden()`: mock-up dili ("Bu işlem için yetkiniz yok", "Kapsamınız dışında kalan kayıtlar listelenmez…"), güvenli çıkış CTA "Giriş Sayfasına dön" |
| 3 | Durum bölge tek yolu ve fail-closed izin kapısı üzerinden render edilir | Yeni render yolu eklenmedi; `/app` `/403` rotası → `forbidden()`; login→token→today akışı aynı |

## Davranış sözleşmeleri

1. **Giriş fail-closed ve post-login doğrulama.** Görünür metin giriş yapmadan
   "başarı" iddiası taşımaz; kimlik doğrulaması `POST /api/v1/auth/login` üzerinden,
   kurum/şube bağlamı oturum sonrası sunucudan doğrulanır.
2. **Tenant alanı opsiyonel.** Mock-up'taki kurum alanı görsel olarak taşınır
   (`name="tenantId"`, `inputmode="latin"`), gönderim yalnız doluysa gerçekleşir.
3. **Erişim sınırı listeemez.** 403 metni `forbidden_non_enumerating` diliyle
   tutarlıdır: kapsam dışı kayıtlar listelenmez, farklı şube/tarih deneyin; raw
   backend kodu/sunucu kopyası kullanılmaz.

## Test

- `test/frontend-runtime/runtime-login-403-face.spec.ts` — statik sözleşme:
  mock-up panel dilini, alan setini, iddiaların yokluğunu, tenant opsiyonel
  submit'ini, 403 kopyasını ve üretim deposu sınırlarını pinler.
- `test/design-shell/validate-design-shell.spec.ts` — mock-up dosyalarının kabuğ
  sözleşmeleri (#488 hazırlığı blokları) aynen kalır.
- Mevcut runtime/frontend-runtime suite'leri (#486/#487 sonrası mevcutları)
  değişmeden geçmelidir.

## Bilinçli sınırlar

- Runtime tarafı (`frontend/runtime/*`) bu dilimde dokunulmadı; `/runtime` giriş
  aside ve `UI_STATES` kopyası zaten mock-up diliyle uyumlu bulundu.
- `/ux/today` sentetik keşif linki (`login-preview`) korundu; gerçek `/ux`
  arşivlemesi coda (`#497`) kapsamındadır.
- Gerçek ekran okuyucu / cihaz sertifikasyonu sentetik spec §10 uyarısıyla
  Faz 2 / `#496` a11y kabul süpürmesine bırakıldı.
