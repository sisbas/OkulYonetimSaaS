# Program seti — UI kod kanıtı (#490 → #450)

Ebeveyn: #471 (Faz 1 Runtime UI mock-ups-first, ADR 0002). Bu dilim, mock-up
fazındaki **Program** ekran setini hem tasarım referansı hem çalışan kod olarak
eşler. #490'ın kart görünümü **#450'de** gün şeridi + gün ajandasına evrildi;
altındaki sözleşmeler (filtreler, K-35, otomatik çözücü yokluğu) korunmuştur.

## Durum tespiti

- `frontend/design/` altında program üçlüsü hazırdı (`program.html`,
  `program-builder.html`, `program-conflicts.html`); runtime tarafında eksikler:
  **kapsam filtreleri yoktu**, yayın-öncesi derleme görünümü yoktu, doğrulama
  bulguları yalnız durum kartında yaşıyordu ve **çakışma çözüm yüzeyi yoktu**.
- `#486`/`#487` kod seamleri main'de hazır (`renderRegionState`, `EMPTY_COPY`,
  `ROUTE_PERMISSIONS`); bu dilim onları yeniden kurmadı, kullandı.
- Mevcut akış (çizelge oluştur → olay satırları → taslağı kaydet → doğrula →
  yayınla) korunmuştur; tek mutasyon yüzeyi olay satırı editörü olarak kalır.

## Teslim edilenler (#490)

| AC | Ne | Kanıt |
|---|---|---|
| 1 | Haftalık program canlı; **sınıf/öğretmen/derslik kapsam filtreleri** | `#program-filter-form` (#branch-filter/#teacher-filter/#room-filter), `populateProgramFilters()` olaylardan seçenek türetir, `filterEvents()` filtreli görünüm, boş sonuç paylaşılan empty yolu |
| 2 | Builder: ders ekleme + çakışma uyarısı | Olay satırı editörü; `validateSchedule` bulguları insan metniyle listelenir ve aynı bulgular çakışma yüzeyine düşer |
| 3 | **Çakışma çözümü**: otomatik çözücü devre dışı | `#schedule-conflicts` + `renderConflictResolution(reasons)`, "Düzenle" satıra götürür (`scrollIntoView`), `#schedule-conflict-note`'ta "otomatik çözücü devre dışı" dürüstlüğü |
| — | Mock-up seam (K-65) | `frontend/design/program*.html` üçlüsü (tokens.css kabuk, K-58 IA) |

## #450 — Haftalık program uçtan uca yayın

Yönetici program bağlamında **taslak oluşturur → haftayı gün şeridi + dikey
ajandayla görür → ders ekler → kaydeder → doğrular → yayınlar**; yayınlanan
program salt okunurdur ve tek ileri yol yeni dönem taslağıdır.

| AC | Ne | Kanıt |
|---|---|---|
| 1 | Yönetici arayüzden taslak oluşturur | `#schedule-create-form` (şube oturumdan, iki tarih zorunlu, `effectiveFrom <= effectiveTo` istemcide), `POST /schedules/drafts` (`If-Match` yok) → `GET /schedules/:id` read-after-write |
| 2 | Hafta gün şeridi + seçili günün ajandası | `#schedule-daystrip` (`.day-chip`, `aria-pressed`, hafta sonu yalnız olay varsa) + `#schedule-agenda` (`startTime` artan, `data-schedule-event` ile tanılama) |
| 3 | Kanonik draft grid durumu | `data-grid-state="weekly_grid_ready_draft"` (durum kartında `data-*`), `readOnly=false` |
| 4 | Yayın güncel tam doğrulama kanıtını gerektirir | `canPublishNow()`: draft durumu + olay sayısı>0 + `dirty=false` + `mode='FULL'` + `evidenceStatus='authoritative'` + `canPublish=true` + `scheduleRevision === read.revision` + `schedule:publish`; kapı `#schedule-gate` üzerinde ayrı kapalılık sebepleriyle görünür |
| 5 | Kanonik published grid durumu | `data-grid-state="weekly_grid_ready_published"`, "Yayınlanmış program · Salt okunur", `publishedAt` tarihi |
| 6 | Yayınlanmışta mutasyon kontrolü yok; yeni taslak tek yol | Düzenleyici/`Ders ekle`/`Taslağı kaydet`/`Doğrula`/`Yayınla` render edilmez; yalnız `#new-schedule-draft` (create yetkisiyle) görünür; `#unpublish-schedule` UI'dan kaldırıldı (uç API'de durur) |

### Davranış notları (#450)

- **Revizyon yankılanır, aritmetik yok.** `GET` ETag'i content-addressed'dır ve
  hiç `If-Match` olarak gönderilmez; mutasyon jetonu gövdedeki `revision`
  alanından `"schedule:<id>:v<n>"` biçiminde kurulur; her mutasyondan sonra
  kaynak yeniden okunur. Kaydedilmemiş satırlar `state.scheduleRows`'ta, kanıt
  `state.scheduleEvidence`'te tutulur.
- **Add-only giriş.** Yeni satırlar kaydedilmeden önce düzenlenebilir/silinebilir;
  kaydedilmiş satırlar ajandada salt-okurdur (yerinde düzenle/sil #452).
- **Bulgular** durum kartından ayrıldı: `#schedule-conflicts`, ham kod yalnız
  `data-schedule-reason`, metin `scheduleReasonLabels` üzerinden. "Göster"
  `scrollIntoView` ile ajanda kalemine götürür.
- **Öğretmen/veli görünümü** açıldı: `TAB_CAPABILITIES.program` any-of
  (`schedule:draft:read` / `schedule:read` / `schedule:own:read`); öğretmen
  `schedule:own:read` ile own projeksiyonu, `schedule:read` ile branch
  yayınını salt-okur görür; mutasyon kontrolleri render edilmez. Viewer sekmeyi
  görmez.
- **Birden fazla program varsa** `#schedule-programme-select` gösterilir
  (Taslaklar+Yayınlananlar dönem etiketiyle).

## Davranış sözleşmeleri

1. **Filtreler istemcide durumu daraltır, sunucu sında eksik veri gizlenmez.**
   Çizelge tek şube kapsamındadır; filtre yüklenen olaylar üzerinde çalışır.
   Boş filtre sonucu "kayıt yok" diye yutturmaz; paylaşılan boş durum görünür.
2. **Ham referans kimlikleri görünür metne sızmaz (K-35).** Gün adı + saat
   aralığı ve sıra bilgisi gösterilir; öğretmen/sınıf/derslik UUID'leri
   `data-*` tanılama kanalında ve form değerlerinde kalır.
3. **Çakışma bulgusu sunucudan gelir, istemci kod üretmez (K-30/K-32).**
   Bulgular `scheduleReasonLabels` etiket haritası üzerinden insan metnine
   dönüştürülür; ham kod yalnız `data-schedule-reason` özniteliğinde yaşar.
4. **Otomatik çözücü yoktur.** Çözüm elle; "Göster" bulgunun ajanda kalemini
   işaretler. İstemcide çözücü fonksiyonu hiç tanımlanmadı (negatif sınırlar
   spec'te).
5. **Kart/ajanda görünümü salt-okunurdur.** Tek mutasyon yüzeyi olay satırı
   editörü kalır; görünüm aksiyon taşımaz (K-59 replacement bağlı).
6. **Yayın kanıtsız açılmaz.** `#schedule-gate` her durumda sebebini yazar;
   boş/kaydedilmemiş/bayat/çakışmalı ayırt edilir (tam kanonik dört engel
   ekranı ve kanıt kartı #453).

## Test

- `test/frontend-runtime/runtime-program-set.spec.ts` — iskelet, filtreler,
  gün şeridi, ajanda, K-35, kapı/read-after-write işaretleri, çakışma yüzeyi.
- `test/frontend-runtime/runtime-weekly-programme.spec.ts` — yükleme sırası,
  gün seçimi ve sıralama, yayın kapısı tablosu, 412'de retry yokluğu, add-only
  akış, teacher own projeksiyonu, seçici, K-35 görünür metin.
- `test/frontend-runtime/runtime-route-permission-seam.spec.ts` — any-of
  istemci tablosu sunucudaki `@PermissionsAny` ile eşleşir.
- `test/e2e/stage5-full-journey.acceptance.e2e-spec.ts` — create → add → save →
  validate → publish; DB kanıtı (`schedule_versions` published, revision 2);
  teacher oturumu yayınlanmış programı salt-okur görür.

## Bilinen sınırlar

- Sunucu şube-kapsamlı programlar döndürür; sınıf/öğretmen/derslik kırpımı
  istemcede yapılır. Sunucu tarafı filtre parametresi ayrı iştir.
- Referans adları (öğretmen/derslik/sınıf/ders etiketleri) okuma DTO'sunda
  yoktur; görünür metin gün/saat/sıra, kimlikler veri kanallarında kalır.
  Referans çözümü sonraki dilimde gelir.
- Sunucu `publish` reddi şu an generic hata üretir (422/409 #453); UI kapıyı
  önceden kapatır ve 5xx'te başarı göstermez.
- Yayından kaldırma (unpublish) UI'da yoktur; yayınlanan program değiştirme
  akışı #453'ün dönem-çakışması çeperiyle birlikte tanımlanır.
