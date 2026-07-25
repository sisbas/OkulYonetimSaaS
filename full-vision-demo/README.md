# Full-Vision Demo

Faz 1–3 ürün vizyonunu gösteren dependency-free, statik ve tamamen sentetik satış prototipi.

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
