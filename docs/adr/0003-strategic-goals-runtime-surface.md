# Stratejik hedefler ekranı yalnız production runtime'da; deploy seviyesinde env flag ile açılır

## Durum

Kabul edildi (owner onayı, 2026-10-21 grilling oturumu). İlgili: `docs/frontend/preflight/adr-production-frontend-runtime.md` (#145), `frontend/ux/spec.md` (§2 IA, §4 Ekran Envanteri).

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

Kritik kısıt: `GET /context` kataloğu (`src/rbac/context-catalog.service.ts`, `ContextCatalog`)
**izin kodu yayımlamaz** — sözleşme gereği yalnız kurum adı, insan-okur rol etiketi, şubeler ve aktif
şube döner; ham `snake_case` izin/rol kodları sızıntı sayılır (#339). Bu nedenle "flag kapalıyken
katalogdan `strategic_goal:*` çıkarılır" tek başına uygulanabilir değildir; görünürlük için
sunucu-kaynaklı, sürümlü bir yetenek (capability) sinyali gerekir. Yan sonuç: runtime'ın mevcut
`TAB_CAPABILITIES` kapısı üretimde boş `state.permissions` gördüğü için fiilen devre dışıdır.

## Kararlar

| #   | Karar                                                                                                                                                                                                                                                     | Gerekçe                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Ekran yalnız `frontend/runtime` içinde yaşar; demo (`frontend/app`, `frontend/ux`) terk edilir, import edilmez.                                                                                                                                             | ADR #145 production yüzeyi sabitliyor; iki yüzeyi paralel yaşatmak ikinci bayat kaynak üretir (K-6).                                                          |
| D2  | Açma/kapama deploy seviyesinde tek anahtar: `STRATEGIC_GOALS_ENABLED`, varsayılan `false`. Tenant bazlı ayar yok.                                                                                                                                          | Settings yüzeyi yok; tenant ayarı yeni kolon + endpoint + ekran demek. Tek anahtar tüm okulları birlikte ve geri alınabilir biçimde açar.                      |
| D3  | Görünürlük sunucu-kaynaklı **capability** sinyaliyle: `ContextCatalog` sürümlü bir `capabilities: string[]` alanı kazanır (`CONTEXT_CATALOG_VERSION` bump) ve flag açıkken `strategic_goals` anahtarını taşır; runtime sekmesi bu anahtara bakar. Flag kapalıyken `/strategic-goals*` route'ları `404` döner. İzin kodu hiç yayımlanmaz; frontend'de ayrı bayrak yoktur. | `/context` sözleşmesi izin kodu yayımlamıyor (#339); capability anahtarı insan-okur, izin sözlüğünden bağımsız ve sürümlenebilir. Tek doğruluk kaynağı; `403` yerine `404` varlık sızdırmaz. |
| D4  | Akademik yıl istemcide tarihten türetilir (Eylül başlangıç; bu dönem ± 1); seçim `?academicYear=` ile sunucuya gider.                                                                                                                                     | `tenant_settings` uç noktası yok; hedef kaydı kendi yılını taşıyor, ek backend yüzeyi gerekmez.                                                               |
| D5  | Silme vardır (soft delete, onay diyaloğu, `manage` izni).                                                                                                                                                                                                  | Hatalı metrik/yıl girişini düzeltmenin tek yolu; izin zaten daraltıyor.                                                                                       |
| D6  | Faz 1'de eşzamanlılık last-write-wins; `version`/ETag eklenmez.                                                                                                                                                                                            | Hedef kaydı tek alan (gerçekleşme) ve okul başına az sayıda yönetici; ETag migration + sözleşme maliyeti bu risk için yüksek. `stale_version` eşlemesi hazır bekler. |
| D7  | Tasarım akışı: önce `frontend/design/` altında statik mock-up (mevcut token setiyle), kod ancak mock-up onayından sonra. Nihai IA yeri `frontend/ux/spec.md` §2'deki **Yönetim** başlığıdır; IA göçü ayrı iştir, bu kapsamda ekran mevcut 6-sekme kabuğunda yaşar. | Tasarım kararı koda her zaman repodaki mock-up/spek üzerinden akar; IA göçü ayrı ticket.                                                                     |
| D8  | Kanıt: runtime harness testleri + tek P0 tarayıcı yolculuğu (yönetici CRUD, öğretmen salt okunur, flag kapalı davranışı).                                                                                                                                   | Harness durum/kopya/izin davranışını hızlı kapsar; tek yolculuk gerçek API yolunu kanıtlar.                                                                  |

## Reddedilen alternatifler

- **Demoyu production'a bağlamak**: ADR #145 ile çelişir; auth/RBAC/tenant güvenliği kanıtsız kalır.
- **Tenant bazlı `strategic_goals_enabled` ayarı**: yeni kolon + `PATCH /tenants/settings` + Ayarlar
  ekranı gerekir; aynı gerçeğin iki kapısı olur. Pilot ihtiyacı doğarsa ayrı ADR ile ele alınır.
- **Yalnız route'ları kapatmak, izinleri bırakmak**: sekme görünür ama boş/404 ekran; kullanıcıya
  yanlış vaat.
- **Frontend build-time flag**: backend deploy'u ile frontend deploy'u ayrışır; görünürlük sinyali
  zaten sunucudan geldiği için ikinci kaynak.
- **`/context` kataloğuna izin kodu eklemek**: #339 sözleşmesini bozar (iç `snake_case` kod sızıntısı);
  yerine capability anahtarı.
- **ETag/If-Match**: Faz 1 için aşırı; D6'ya bakınız.
- **`tenant_settings.academic_year_label` okumak**: uç nokta yok; ek kapsam.

## Sonuçlar

- PR #469 kapatıldı, `feat/agent-gh-459` dalı silindi; #459 "demo, runtime ile değiştirildi" olarak
  kapandı.
- Yeni iş kırılımı: **#482** (env flag + `ContextCatalog.capabilities` sözleşmesi, blocked by #467) →
  **#483** (runtime ekranı + mock-up, blocked by #482 ve #467) → **#484** (P0 tarayıcı yolculuğu,
  blocked by #483).
- Flag açılana kadar hiçbir okul ekranı görmez; açma deploy env değişikliğidir ve geri alma aynı
  değişkeni `false` yapmaktır (capability anahtarı da aynı anda düşer).
- Runtime'da ikinci bir görünürlük kapısı (ayar ekranı) doğmaz; nav görünürlüğü capability, yaptırım
  ise izin + `404` olarak tek kaynak kalır.

## Açık sorular

- `src/rbac/permission-catalog.ts` içinde `strategic_goal.manage` için `audit_required: false`
  (#467 açık sorusu) — Constitution III ile çelişki; #482 kapsamında ele alınacak.
- `operations_manager` rolüne `strategic_goal:read` verilecek mi (şu an fail-closed).
- Üretimde `/context` izin döndürmediği için runtime'ın `TAB_CAPABILITIES` kapısı fiilen inert; mevcut
  sekmelerin görünürlüğü ne zaman capability sözleşmesine taşınacak (ayrı iş, bu ADR yalnız yeni
  ekranı kapsar).
