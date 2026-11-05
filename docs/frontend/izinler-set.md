# İzinler seti — UI kod kanıtı (#491)

Ebeveyn: #471 (Faz 1 Runtime UI mock-ups-first, ADR 0002). Bu dilim, mock-up
fazının eksik kalan **İzinler** ekran setini hem tasarım referansı hem çalışan
kod olarak teslim eder.

## Durum tespiti (neden bu kapsam)

- `frontend/design/` altında yalnız `strategic-goals.html` vardı; **İzinler
  mock-up'ı yoktu** ve `#491` "mock-up'tan koda" diyordu.
- `#486`/`#487`'nin kod seamleri zaten main'de: `renderRegionState` (K-40/K-41) ve
  `ROUTE_PERMISSIONS` (K-44/45). Sorunlar açık olsa da kullanılabilir durumdalar.
- Legacy runtime'da izin listesi + tek-kayıt okuma + onay/ret + etki paneli vardı;
  eksikler: durum rozet dili (`draft` yoktu), filtre kesitleri, **İzinlerim
  listesi**, form ön doğrulaması, görevlendirme durumunun karar kartında
  görünmemesi.

## Teslim edilenler

| AC | Ne | Kanıt |
|---|---|---|
| 1 | Durum rozet dili (taslak/beklemede/onaylandı/reddedildi) + liste/İzinlerim filtre kesitleri | `app.js` `statusLabels`/`statusTones`/`statusBadge`, `index.html` `#leave-status-filter` + `#my-leaves-status-filter`, `screens/decisions.js` `applyStatusFilter` |
| 2 | Yeni talep formu: tarih aralığı + gerekçe kategorisi; **özel sağlık metni yok** | `index.html` `#leave-form` (yalnız iki `datetime-local`, iki `select`), `app.js` `validateLeaveWindowInput` |
| 3 | Etki/karar detayı: impact analizi, görevlendirme durumu, onay/ret | `screens/decisions.js` karar kartı (`Karşılık`, `Görevlendirme`, If-Match `data-leave-etag`), mock-up `#impact-table` |
| — | Mock-up seam (K-65) | `frontend/design/izinler.html` (statik, tokens.css, K-58 IA, durum matrisi) |

## Davranış sözleşmeleri

1. **Rozet dili tek kaynaklıdır.** Görünür metin `statusLabels`'tan gelir; ham
   durum kodu yalnız `data-status` özniteliğinde kalır. Haritada olmayan değer
   nötr "Durum bilinmiyor" olur (ham kod asla sızmaz).
2. **Filtre sunucuya gider.** Seçili kesit `decisionStatus` parametresi olarak
   API'ye iletilir; liste istemcide kırpılmaz (eksik sayfa "filtre çalışıyor"
   gibi görünmesin). Seçim `aria-pressed` ile işaretlenir, yalnız renkle
   anlatılmaz.
3. **Sahiplik sunucuda çözülür.** İzinlerim `GET /api/v1/leaves/me` çağırır ve
   istemci `teacherId` göndermez. Uç dağıtık değilse (404/405) liste "kayıt yok"
   diye gösterilmez; dürüst bir "bu sürümde kullanılamıyor" durumu render
   edilir (#263 ile gelen uç merge olduğunda liste otomatik aktifleşir).
4. **Form ön doğrulaması yetki sınırı değildir.** `validateLeaveWindowInput`
   yalnız boşuna 400 üretmemek için aralığı erkenden reddeder; asıl doğrulama
   sunucudadır (`src/leaves/leave-window.ts`). Kurallar aynı: saatlik ≤ 24 saat
   ve en fazla bir gün sınırı, tam gün tek takvim günü, çok gün ≥ 2 gün.
5. **Sağlık gerekçesi kategoridir.** Formda serbest metin/tanı alanı yoktur;
   gerekçe yalnız `health` kategorisi olarak seçilir (KVKK veri minimizasyonu).

## Test

- `test/frontend-runtime/runtime-leave-set.spec.ts` — 12 test: rozet dili, filtre
  kesitleri, İzinlerim sahipliği + 404 dürüstlüğü, form sınırları (textarea yok),
  pencere ön doğrulaması, karar kartı görevlendirme durumu, mock-up kabuğu ve
  K-58 IA sırası.
- Mevcut `test/frontend-runtime/*` suite'i (147 test) ve `stage5-full-journey`
  seçicileri değişmeden geçer.

## Bilinçli sınırlar

- Mock-up statik referanstır: gerçek ekran okuyucu/cihaz sertifikasyonu yapmaz
  (sentetik spec §10 uyarısı geçerli).
- İzinlerim listesi `GET /leaves/me` ucuna (PR #505) bağlıdır; uç main'de.
  İstemci seam'i de tamamlandı: `ROUTE_PERMISSIONS` `GET /leaves/me` →
  `leave:own:read` eşlemesini `GET /leaves/:id` kuralından **önce** taşır
  (aksi hâlde `me` yolu genel kurala düşüp `leave:read` çözüyordu ve öğretmenin
  kendi listesi istemcide fail-closed reddediliyordu). Regresyon testi:
  `runtime-leave-set.spec.ts`.
- `#486`/`#487` issue'ları kapandı; bu dilim onların kod seamlerini kullanır
  ama kendi kapsamlarını (ör. tüm bölgelerde durum dikişi, tam rol matrisi)
  kapatmaz.
