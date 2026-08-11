# Full-Vision Demo

Faz 1–3 ürün vizyonunu gösteren dependency-free, statik ve tamamen sentetik satış prototipi.

## Katman ayrımı: demo / Full Vision / production MVP

| Katman | Konum | Konumlandırma |
|---|---|---|
| Demo (tarihsel) | `demo-frontend/` (`/demo/*`) | Beş ekranlık tıklanabilir sunum prototipi |
| Full Vision | `full-vision-demo/` (`/full-vision/*`) | Bu klasör; ana satış/demo kaynağı, GATE 2 kabul artefaktı |
| Production MVP | `src/` + `api/v1` (backend-only NestJS API) | Faz 1 MVP çekirdeği; demo kaynağı değildir, commercial release değildir |

Bu klasör yalnız sentetik satış prototipidir; production roadmap'i, frontend/backend runtime'ı, auth, API sözleşmesi veya deployment kararını değiştirmez.

## Demo anlatısı (11 Ağustos 2026 CMO loop kararı)

Demo anlatısı: **Ders Programı → İzin → Günlük Operasyon**.

1. **Ders Programı** — Program Stüdyosu hazır çizelgeleme sonucunu, gevşetme aşamalarını ve teşhis kanıtını gösterir; canlı çözümleme veya kalıcı yayınlama yapmaz.
2. **İzin** — İzin kararının ders etkisi ve yedek öğretmen atamasıyla birlikte ele alındığını gösterir; onay yalnız demo durumunda simüle edilir.
3. **Günlük Operasyon** — Yedek bulunmayan derslerin operasyon kuyruğunda açık kaldığını ve günün kapanışını gösterir.

**Yoklama ve Veli Bilgilendirme planning-only sınır olarak korunur.** İki ekran da bu anlatıda uygulanmış ürün derinliği iddiası taşımaz: yoklama yalnız kodlu sentetik öğrenciler üzerinde iş akışı gösterir, bildirim yalnız gönderim simülasyonu tamamlar. Bu sınır mesajları claim manifestinde ve görünür ekran etiketlerinde korunur.

## Routing authority kanıtı — commercial release değildir

Production `/api/v1` routing authority kanıtının merge edilmiş olması (nested route'ların Nest'e ulaşması, Vercel rewrite taşıma, kontrollü JSON hata shape'i) **commercial release readinessi ispatlamaz**. Bu kanıt yalnız network yolunun açık olduğunu ve hata shape'inin platform HTML yerine Nest kontrolünde döndüğünü gösterir. Satış anlatımında veya kabul kayıtlarında şu sınır korunur:

- Faz 1 MVP modül tamamlama, security/KVKK/audit kapanışı ve imzalı veri sözleşmeleri ayrı kapılardır ve açık değildir.
- Hosted release yalnız `/full-vision/*` sözleşmesinde ayrı kapı olarak kalır.
- "Routing kanıtı merge edildi" cümlesi hiçbir yerde "ürün pazarlanabilir" iddiasına çevrilemez.

## GATE 2 kapsamı

- 25 canonical route ve 21 ürün ekran ailesi manifestte dondurulmuştur.
- Genel Bakış ile Faz 1 Operasyon P0 akışı yüksek sadakatlidir.
- Diğer ekranlar olgunluk etiketli kontrollü sonraki-dilim görünümüdür.
- State yalnız tarayıcı belleğinde tutulur; reset aynı seed’e döner.
- Gerçek API, auth, storage, kişi verisi, mesaj, model veya dış bağlantı yoktur.
- Root `vercel.json` bu GATE’te değiştirilmez; hosted release ayrı kapıdır.

## 24 Temmuz 2026 çalışma kararı

Bu çalışma artık ayrı demo repository'si yerine ana `sisbas/OkulYonetimSaaS` reposu içindeki `full-vision-demo/` üzerinden ilerler.

- `full-vision-demo/`: Ana satış/demo kaynağıdır; statik, sentetik ve testli kalır.
- `full-vision-builder/`: Builder.io deneme kabuğudur; ana görüntüleme yolu değildir.
- Production frontend/backend: GATE 3 runtime bağımlılıkları kapanana kadar demo kaynağı yapılmaz.
- İzin kararı ve ders kapsaması ayrı gösterilir; yönetici onayı simüle edilebilir, yedek bulunmayan dersler Daily Operations kuyruğunda açık kalır.
- Program Stüdyosu, hazır çizelgeleme sonucu ve teşhis kanıtı gösterir; canlı çözümleme veya kalıcı yayınlama yapmaz.

## Çalıştırma

```bash
node full-vision-demo/local-server.js
```

Ardından `http://127.0.0.1:4174/full-vision/overview` adresini açın.

Hosted release sözleşmesinde Full-Vision yalnız `/full-vision/*` altında çalışır; tarihsel beş ekranlık demo `/demo/*` altında korunur.

## Doğrulama

```bash
npm run verify:gate2
```

Bu komut manifest, fixture, reducer, claim, boundary, responsive sözleşmesi, bounded build ve HTTP deep-link testlerini çalıştırır.

Gerçek Chromium viewport, route, replay ve P0 akış matrisi için izole QA runtime’ı kurulduktan sonra:

```bash
GATE2_BROWSER_MODULE_ROOT=/tmp/gate2-browser/node_modules npm run demo:full:browser
```

CI bu geçici runtime’ı otomatik kurar ve 28 ekran görüntüsü ile JSON kabul raporunu workflow artefaktı olarak yayımlar. Uygulamanın üretim çıktısına browser paketi eklenmez.
