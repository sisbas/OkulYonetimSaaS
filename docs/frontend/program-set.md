# Program seti — UI kod kanıtı (#490)

Ebeveyn: #471 (Faz 1 Runtime UI mock-ups-first, ADR 0002). Bu dilim, mock-up
fazındaki **Program** ekran setini hem tasarım referansı hem çalışan kod olarak
eşler.

## Durum tespiti

- `frontend/design/` altında program üçlüsü hazırdı (`program.html`,
  `program-builder.html`, `program-conflicts.html`); runtime tarafında eksikler:
  **kapsam filtreleri yoktu**, yayın-öncesi derleme görünümü yoktu, doğrulama
  bulguları yalnız durum kartında yaşıyordu ve **çakışma çözüm yüzeyi yoktu**.
- `#486`/`#487` kod seamleri main'de hazır (`renderRegionState`, `EMPTY_COPY`,
  `ROUTE_PERMISSIONS`); bu dilim onları yeniden kurmadı, kullandı.
- Mevcut akış (çizelge oluştur → olay satırları → taslağı kaydet → doğrula →
  yayınla) korunmuştur; tek mutasyon yüzeyi olay satırı editörü olarak kalır.

## Teslim edilenler

| AC | Ne | Kanıt |
|---|---|---|
| 1 | Haftalık program canlı; **sınıf/öğretmen/derslik kapsam filtreleri** | `#program-filter-form` (#branch-filter/#teacher-filter/#room-filter), `populateProgramFilters()` olaylardan seçenek türetir, `filterEvents()` + `renderLessonCards()` filtreli kart görünümü, boş sonuç paylaşılan empty yolu |
| 2 | Builder: ders ekleme + çakışma uyarısı | Mevcut olay satırı editörü korunur; `validateSchedule` bulguları insan metniyle listelenir ve aynı bulgular çakışma yüzeyine düşer |
| 3 | **Çakışma çözümü**: ders detayı + aday seçimi; otomatik çözücü devre dışı | `#schedule-conflicts` + `renderConflictResolution(reasons)`, "Düzenle" satıra götürür (`scrollIntoView`), başlıkta ve `#schedule-conflict-note`'ta "otomatik çözücü devre dışı" dürüstlüğü |
| — | Mock-up seam (K-65) | `frontend/design/program*.html` üçlüsü (tokens.css kabuk, K-58 IA) |

## Davranış sözleşmeleri

1. **Filtreler istemci*durumu daraltır, sunucu sında eksik veri gizlenmez.**
   Çizelge tek şube kapsamındadır; filtre yüklenen olaylar üzerinde çalışır.
   Boş filtre sonucu "kayıt yok" diye yutturmaz; paylaşılan boş durum görünür.
2. **Ham referans kimlikleri görünür metne sızmaz (K-35).** Ders kartı özeti
   yalnız gün adı + saat aralığı gibi gerçek kullanıcı verisi gösterir;
   öğretmen/sınıf/derslik UUID'leri `data-lesson-*` tanılama kanalında kalır.
3. **Çakışma bulgusu sunucudan gelir, istemci kod üretmez (K-30/K-32).**
   Bulgular `scheduleReasonLabels` etiket haritası üzerinden insan metnine
   dönüştürülür; ham kod yalnız `data-schedule-reason` özniteliğinde yaşar.
4. **Otomatik çözücü yoktur.** Çözüm elle: satırı düzenle → aday
   öğretmen/derslik/saat seç; "Düzenle" ilgili `data-schedule-row`'a götürür.
   İstemcide çözücü fonksiyonu hiç tanımlanmadı (negatif sınırlar spec'te).
5. **Kart görünümü salt-okunurdur.** Tek mutasyon yüzeyi olay satırı editörü
   kalır; kartlar aksiyon taşımaz (K-59 replacement bağlı).

## Test

- `test/frontend-runtime/runtime-program-set.spec.ts` — 12 test: filtre yüzeyi
  ve seçenek türetimi, kart görünümü + K-35 kimlik kuralı, çakışma yüzeyi ve
  otomatik-çözücü-absan, mock-up kabuk üçlüsü, kanonik etiket haritası.
- Mevcut `test/frontend-runtime/*` suitleri (kopya hijyeni statik tarama dahil)
  ve `stage5-full-journey` seçicileri değişmeden geçer.

## Bilinen sınırlar

- Sunucu şube-kapsamlı tek çizelge döndürür; sınıf/öğretmen/derslik kırpımı
  istemcede yapılır. Sunucu tarafı filtre parametresi ayrı iştir (API yok
  sınırı, spec #471).
- Görevlendirme aday listesi (aday seçimi) izin görevlendirme akışıyla ortak
  veriye dayanır; program çakışma çözümü bu turda satır düzenlemesine bağlandı.
- Journey E2E seçicilerin taşınması #495'te (izlek A, mevcut UI'da yeşilleşme
  K-60).
