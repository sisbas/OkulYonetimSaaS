# Yoklama seti — UI kod kanıtı (#492)

Ebeveyn: #471 (Faz 1 Runtime UI mock-ups-first, ADR 0002). Bu dilim, mock-up
fazının eksik kalan **Yoklama** ekran setini hem tasarım referansı hem çalışan
kod olarak teslim eder.

## Durum tespiti

- `frontend/design/` altında **Yoklama mock-up'ı yoktu** (izinler.html/strategic-goals.html vardı).
- Legacy `screens/attendance.js` içinde oturum açma/kayıt/kilitleme vardı; **eksik/tamamlanmış
  ayrımı, beş işaret göstergesi, toplu geldi, devamsızlık sonuç paneli ve dürüst kopyalar yoktu**.
- `#486`/`#487` kod seamleri main'de hazır (`renderRegionState`, `ROUTE_PERMISSIONS`); bu PR onları
  yeniden kurmadı, kullandı.

## Teslim edilenler

| AC | Ne | Kanıt |
|---|---|---|
| 1 | Oturum listesi **eksik/tamamlanmış** ayrımıyla | `attendanceCompletion()` (K-50: kilitli = tamamlanmış), kart rozeti + `data-attendance-state`, `#attendance-status-filter` kesitleri, "N / M oturum gösteriliyor" dürüst sayım |
| 2 | İşaretleyici: **beş işaret** + **toplu geldi** + **tamamla**; kilit/kilitsiz ayrımı | `ATTENDANCE_MARKS` + "İşaretlenmedi" (kaydın yokluğu), `bulkPresent()`, "Tamamla ve kilitle" + K-50 kopyası, kilitli görünümde `locked_state` + düzenleme düğmeleri kapalı |
| 3 | **Absences**: sonuçlar listesi + "işaretlenmemiş devamsız sayılmaz" | `renderAttendanceAbsences()`, `#attendance-absences` paneli, sayaçlar (geldi/gelmedi/geç/izinli/işaretlenmedi), `data-not-marked-copy` |
| — | Mock-up seam (K-65) | `frontend/design/yoklama.html` (tokens.css kabuğu, K-58 IA, durum matrisi) |

## Davranış sözleşmeleri

1. **Tamamlanma kilitle tanımlıdır (K-50).** Kilitli oturum "Tamamlanmış", kilitli olmayan
   "Eksik"tir. Ayrım yalnız renkle değil, metinle ve `data-attendance-state` ile bildirilir.
2. **"İşaretlenmedi" bir kayıt değildir.** POST edilen işaretler dört tanedir
   (geldi/gelmedi/geç geldi/izinli); işaretlenmedi durumu kaydın yokluğudur ve **devamsız
   sayılmaz**. Devamsızlık sonucu yalnız açıkça `absent` işaretlenen öğrencilerden oluşur.
3. **Toplu geldi yalnız işaretlenmemişlere uygulanır.** Mevcut işaretler sessizce ezilmez;
   sunucuda toplu uç olmadığı için kayıtlar sırayla yazılır ve hata olursa kalan sayı dürüstçe
   bildirilir (`Toplu geldi kısmen uygulandı: n/m`).
4. **Kilitli oturum salt-okunur.** Kilitli görünümde işaretleme düğmeleri yoktur; kayıt yalnız
   kontrollü düzeltme (gözetim + kapalı gerekçe sözlüğü + `expectedVersion`) ile değişir.
5. **Filtre boş sonucu "kayıt yok" diye yutturmaz.** Kesit boşsa "Bu kapsamda eksik oturum yok"
   gibi kesite özgü dürüst durum gösterilir; tüm liste boşsa genel boş durum.

## Test

- `test/frontend-runtime/runtime-attendance-set.spec.ts` — 9 test: tamamlanma türetimi ve
  rozet dili, filtre kesitleri + dürüst sayım, beş işaret sözleşmesi, toplu geldi kısmi-hata
  dürüstlüğü, K-50 kilitleme kopyası, absences kuralı, mock-up kabuğu + IA sırası.
- Mevcut `test/frontend-runtime/*` ve `test/e2e/stage5-full-journey` seçicileri değişmeden geçer.

## Bilinçli sınırlar

- Mock-up statik referanstır; gerçek ekran okuyucu/cihaz sertifikasyonu yapmaz (sentetik spec §10).
- Devamsızlık sonuçları **açık oturum** için hesaplanır (kayıtlar zaten yüklü). Tüm oturumlar için
  toplu rapor ayrı bir raporlama dilimidir (#494).
- `#486`/`#487` kendi kapsamlarıyla kapanacak; bu PR yalnız seamleri kullanır.
