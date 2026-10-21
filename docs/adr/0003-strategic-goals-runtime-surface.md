# Stratejik hedefler ekranı yalnız production runtime'da; deploy seviyesinde env flag ile açılır

## Durum

Kabul edildi (owner onayı, 2026-10-21 grilling oturumu). İlgili: ADR 0002 (mock-up önce), ADR
`docs/frontend/preflight/adr-production-frontend-runtime.md` (#145).

## Bağlam

Stratejik hedefler ekranının ilk uygulaması `frontend/app` (tıklanabilir demo) içinde, demo store'a
bağlı olarak yazıldı (#459 / PR #469). ADR #145 production frontend yüzeyini `frontend/runtime`
olarak sabitliyor ve demo artefaktlarının production runtime'a taşınmasını yasaklıyor: demo
deterministik yerel durum kullanır, auth/API/RBAC içermez ve tenant-güvenli davranışı kanıtlamaz.
Bu nedenle demo ekranı production'a bağlanamaz; ekranın runtime'da yeniden yazılması gerekir.

Backend tarafı (#457 / PR #467) hazır: `POST/GET/GET :id/PATCH/DELETE /strategic-goals`,
`strategic_goal:read` ve `strategic_goal:manage` izinleri, `duplicate_metric_year` çakışma nedeni,
akademik yıl filtresi (`?academicYear=`). `tenant_settings` tablosunda `academic_year_label` var ama
hiçbir settings uç noktası yok; stratejik hedefler için tenant bazlı açma/kapama kolonu da yok.

## Kararlar

| #   | Karar                                                                                                                                                                                                                                                     | Gerekçe                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Ekran yalnız `frontend/runtime` içinde yaşar; demo (`frontend/app`, `frontend/ux`) terk edilir, import edilmez.                                                                                                                                             | ADR #145 production yüzeyi sabitliyor; iki yüzeyi paralel yaşatmak ikinci bayat kaynak üretir (K-6).                                                          |
| D2  | Açma/kapama deploy seviyesinde tek anahtar: `STRATEGIC_GOALS_ENABLED`, varsayılan `false`. Tenant bazlı ayar yok.                                                                                                                                          | Settings yüzeyi yok; tenant ayarı yeni kolon + endpoint + ekran demek. Tek anahtar tüm okulları birlikte ve geri alınabilir biçimde açar.                      |
| D3  | Flag kapalıyken `/context` kataloğu `strategic_goal:*` izinlerini döndürmez ve `/strategic-goals*` route'ları `404` döner. Görünürlük yalnız izinden gelir; frontend'de ayrı bayrak yoktur.                                                                | Tek doğruluk kaynağı; `403` yerine `404` varlık sızdırmaz (non-enumerating). Frontend bayrağı backend ile ayrışma riski taşır.                                |
| D4  | Akademik yıl istemcide tarihten türetilir (Eylül başlangıç; bu dönem ± 1); seçim `?academicYear=` ile sunucuya gider.                                                                                                                                     | `tenant_settings` uç noktası yok; hedef kaydı kendi yılını taşıyor, ek backend yüzeyi gerekmez.                                                               |
| D5  | Silme vardır (soft delete, onay diyaloğu, `manage` izni).                                                                                                                                                                                                  | Hatalı metrik/yıl girişini düzeltmenin tek yolu; izin zaten daraltıyor.                                                                                       |
| D6  | Faz 1'de eşzamanlılık last-write-wins; `version`/ETag eklenmez.                                                                                                                                                                                            | Hedef kaydı tek alan (gerçekleşme) ve okul başına az sayıda yönetici; ETag migration + sözleşme maliyeti bu risk için yüksek. `stale_version` eşlemesi hazır bekler. |
| D7  | Tasarım akışı ADR 0002'ye tabidir: önce `frontend/design/` mock-up, kod ondan sonra. Kanonik IA'da (K-58) nihai yer **Yönetim**; IA göçüne kadar mevcut sekme kabuğunda yaşar.                                                                            | K-57 "kod her zaman mock-up/spek üzerinden akar"; IA göçü ayrı iş, bu ticket onu yapmaz.                                                                      |
| D8  | Kanıt: runtime harness testleri + tek P0 tarayıcı yolculuğu (yönetici CRUD, öğretmen salt okunur, flag kapalı davranışı).                                                                                                                                   | Harness durum/kopya/izin davranışını hızlı kapsar; tek yolculuk gerçek API yolunu kanıtlar.                                                                  |

## Reddedilen alternatifler

- **Demoyu production'a bağlamak**: ADR #145 ile çelişir; auth/RBAC/tenant güvenliği kanıtsız kalır.
- **Tenant bazlı `strategic_goals_enabled` ayarı**: yeni kolon + `PATCH /tenants/settings` + Ayarlar
  ekranı gerekir; aynı gerçeğin iki kapısı olur. Pilot ihtiyacı doğarsa ayrı ADR ile ele alınır.
- **Yalnız route'ları kapatmak, izinleri bırakmak**: sekme görünür ama boş/404 ekran; kullanıcıya
  yanlış vaat.
- **Frontend build-time flag**: backend deploy'u ile frontend deploy'u ayrışır; catalog zaten izin
  taşıdığı için ikinci kaynak.
- **ETag/If-Match**: Faz 1 için aşırı; D6'ya bakınız.
- **`tenant_settings.academic_year_label` okumak**: uç nokta yok; ek kapsam.

## Sonuçlar

- PR #469 kapatıldı, `feat/agent-gh-459` dalı silindi; #459 "demo, runtime ile değiştirildi" olarak
  kapandı.
- Yeni iş kırılımı: **#482** (env flag, blocked by #467) → **#483** (runtime ekranı + mock-up,
  blocked by #482 ve #467) → **#484** (P0 tarayıcı yolculuğu, blocked by #483).
- Flag açılana kadar hiçbir okul ekranı görmez; açma deploy env değişikliğidir ve geri alma aynı
  değişkeni `false` yapmaktır.
- Runtime'da ikinci bir görünürlük kapısı (ayar ekranı) doğmaz; izin matrisi tek kaynak kalır.

## Açık sorular

- `src/rbac/permission-catalog.ts` içinde `strategic_goal.manage` için `audit_required: false`
  (#467 açık sorusu) — Constitution III ile çelişki; #482 kapsamında ele alınacak.
- `operations_manager` rolüne `strategic_goal:read` verilecek mi (şu an fail-closed).
