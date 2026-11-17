# Bugün seti — UI kod kanıtı (#489)

Ebeveyn: #471 (Faz 1 Runtime UI mock-ups-first, ADR 0002). Bu dilim, mock-up
fazının Bugün ekranı setini gerçek runtime yüzeyine taşır:
`frontend/design/bugun.html` → `frontend/runtime/screens/bugun.js` + `frontend/runtime/index.html`.

## Durum tespiti

- `frontend/design/bugun.html` (PR #515) statik mock-up olarak main'de hazırdı;
  `#489` "mock-up'tan koda" taşıyordu. Blocked-by sırası (#486/#487) kapanmış
  durumda (`renderRegionState` K-40/K-41 ve fail-closed izin kapısı #445 zaten
  mevcut) — bu PR yeni seam kurmaz, yalnız port eder.

## Teslim edilenler

| AC | Ne | Değişiklik |
|---|---|---|
| 1 | Bugün ekranı canlı: kuyruk dersi kartı + ikincil liste + istatistik şeridi | `screens/bugun.js` `loadTodayDashboard()`: istatistik (Açık iş / Karar bekleyen izin / Bugünün oturumları) + kuyruk (`GET /daily-operations/today`, K-47) + ikincil oturumlar (`GET /attendance/sessions` + `sessionDate` filtresi, K-48/K-50); kartlar: kapsam/coverage (Karşılık bekliyor / Karşılandı / Kısmen karşılandı), aksiyonlar (Adayları gör → impact, Yoklamayı aç, Görevlendirmeyi geri al) |
| 2 | Dört rol varyantı ayrı kesitlerde; öğretmen mutasyon kontrolleri kapalı, dürüst ipucu | Aktör kesiti `renderBugunKesit()` (kuyruk/karar/yoklama permission anahtarları); öğretmen persona `TEACHER_PERMISSION_KEYS` ile dar kapsam; "Bu ölçüm yetkiniz kapsamında değil." dürüst kopyası |
| 3 | Durum kesitleri tek `renderRegionState` yolu üzerinden | `loadTodayDashboard` içindeki boş/engelli/forbidden/offline durumları yalnız `renderRegionState` + `EMPTY_COPY` / `renderError`; yeni blok üretilmez |

## Davranış sözleşmeleri

1. **Kuyruk kartı dürüst kopya.** Kapsam `unresolved|partially_covered` → "Karşılık
   bekliyor"; `covered` → "Karşılandı"; `not_required` → "Karşılık gerekmiyor";
   atanmadan "Henüz atanmadı", atanınca "Atandı" ayrı durumdur. Sıfır kart
   "aday yok" diye yutturmaz — `same_scope_empty`.
2. **İkincil oturumlar K-50.** Tamamlama = kilitleme; kilitli + düzeltme yetkisi
   → `completed`; kilitli + düzeltme yetkisi yok → `locked`; kilitli olmayan → `open`.
3. **Ölçümler yetki ile kesitlenir.** Metrikler `canRequest` ile; yoksa "Bu ölçüm
   yetkiniz kapsamında değil." — K-45 fail-closed yakınsamasi.
4. **Aktör kesitleri.** Kuyruk/karar/yoklama boolean'ları permission anahtarlarından
   türetilir; kartlar `data-kesit` ile işaretlenir.

## Test

- `test/frontend-runtime/runtime-bugun-set.spec.ts` — statik sözleşme + harness
  yolculuğu (açık iş sayımı, kuyruk kartı dili, empty/forbidden, rol kesitleri,
  mockup kabuğu).
- `test/frontend-runtime/runtime-harness.ts` — `SCREEN_MODULES` listesine `bugun`
  eklendi.
- `test/design-shell/validate-design-shell.spec.ts` — mockup pins (#489 hazırlığı)
  aynen kalır.
- Mevcut runtime/frontend-runtime suite'leri değişmeden geçmelidir.

## Bilinçli sınırlar

- `/app` legacy Bugün ekranı bu dilimde dokunulmadı; Faz 1 runtime yüzeyi kapsam.
- `/ux/today` sentetik keşif linki dokunulmadı; coda `#497`.
- Gerçek ekran okuyucu / cihaz sertifikasyonu sentetik spec §10 uyarısıyla
  `#496` a11y kabul süpürmesine bırakıldı.

Refs #489
