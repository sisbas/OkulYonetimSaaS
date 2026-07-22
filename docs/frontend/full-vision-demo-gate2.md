# Full-Vision Demo — GATE 2 Karar ve Kanıt Kaydı

## Kaynak zinciri

- Ana tracker: GitHub Issue #126 — `FULL-VISION-DEMO`
- GATE 0: Faz 1–3 demo scope freeze kararı
- GATE 1: Route-driven bilgi mimarisi, Sunum Modu ve görsel sistem kararı
- Production Faz 1 sınırı: Issue #21 ve ayrıntı kayıtları #39–#43

Bu çalışma yalnız sentetik verili satış prototipidir. Production roadmap, frontend, backend, auth, API ve deployment sözleşmesini değiştirmez.

## Mimari değerlendirme

| Alternatif | Değerlendirme | Karar |
|---|---|---|
| Mevcut `demo-frontend`i genişletmek | İlk adımı hızlandırır; tek dosya büyümesi ve mevcut beş ekranın regresyon riskini artırır | Reddedildi |
| Yeni bounded `full-vision-demo/` uygulaması | Production ve eski demodan ayrışır; dependency-free, statik ve allowlist ile test edilebilir | **Seçildi** |
| Production frontend kabuğunu kullanmak | Görsel yakınlık sağlar; auth/API/runtime ve production-scope sızıntısı riski taşır | Reddedildi |

## Uygulanan GATE 2 kapsamı

- Merkezi route manifestinde 25 canonical route deseni, 21 ürün ekran ailesi ve 5 legacy alias.
- Merkezi scenario ve claim manifestleri.
- Sabit seed ve clock kullanan, yalnız `D-` önekli sentetik fixture graph.
- Bellek içi, saf reducer tabanlı ve resetlenebilir demo durumu.
- Yüksek sadakatli P0 akışı: genel bakış → günlük operasyon → izin/yedek → program önizleme → yoklama → bildirim simülasyonu → tamamlanan gün.
- GATE 2 dışında kalan route’larda boş sayfa yerine olgunluk etiketli kontrollü sonraki dilim görünümü.
- Route özelinde query allowlist; bilinmeyen anahtar ve geçersiz değerler render öncesi temizlenir.
- SPA senaryo geçişi, hard refresh ve browser back/forward aynı canonical snapshot’ı yeniden kurar.
- Görünür breadcrumb, kontrollü 404/kayıt bulunamadı durumları, claim drawer focus trap ve tablet drawer focus return davranışları.
- Program Stüdyosu görünüm ayrımı ve Faz 3 ekranlarında görünür “Canlı AI sonucu değildir.” sınırı.

## Statik güvenlik sınırı

- Runtime API, network client, auth, cookie, token, browser storage, service worker, rastgelelik ve gerçek PII içermez.
- CSP: `connect-src 'none'` ve `form-action 'none'`.
- Build yalnız açık runtime allowlist'indeki dosyaları kopyalar; symlink ve beklenmeyen uzantıyı reddeder.
- Çıktı serverless function üretmez.
- Kök `vercel.json` bu gate kapsamında değiştirilmemiştir.

## Yerel kanıt

`npm run verify:gate2` şu katmanları birlikte çalıştırır:

- manifest, alias, query allowlist, fixture, reducer, replay/reset, claim ve erişilebilirlik sözleşme testleri;
- bounded statik build;
- 25 canonical route ve 5 legacy alias için GET/HEAD, MIME ve CSP testleri;
- bilinmeyen asset için 404, mutating method için 405;
- runtime dosya sayısı ve serverless function sayısı doğrulaması.

`npm run demo:full:browser` izole Chromium QA runtime’ıyla şu kanıtları üretir:

- 1440×900, 1280×800, 1024×768 ve 768×1024 boyutlarında 4/4 viewport;
- her viewport için Genel Bakış, Operasyon, persona filtresi, Sunum Modu, claim drawer, Program ve Yoklama olmak üzere 28/28 ekran görüntüsü;
- 25/25 doğru canonical ekran render’ı ve 5/5 legacy alias;
- P0 operasyon akışı, query sanitizasyonu, görünür 404, hard refresh ve browser back/forward;
- console error, dış/restricted request, cookie ve browser storage için 0 bulgu;
- Sev-1: 0, Sev-2: 0.

CI workflow’u statik kontrat ve browser matrisini ayrı işlerde çalıştırır; ekran görüntülerini ve JSON raporunu `gate2-browser-evidence` artefaktı olarak saklar.

## GATE kararı

**HOLD — GitHub/CI kanıtı bekleniyor**

Yerel otomatik sözleşmeler geçse de aşağıdaki bağımsız kanıtlar tamamlanmadan PASS verilemez:

1. Kodun yetkili GitHub branch/PR üzerinde yayımlanması ve exact-head CI sonucu.
2. Yayımlanan exact head üzerinde bağımsız onay.

Hosted immutable URL, Preview Protection ve Vercel deployment doğrulaması ayrı release gate kapsamındadır.
