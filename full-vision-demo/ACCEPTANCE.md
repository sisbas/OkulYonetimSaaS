# GATE 2 Kabul Kanıtı

## Mevcut karar

**HOLD — yalnız GitHub/CI kanıtı bekleniyor.** Yerel otomatik sözleşmeler ve gerçek Chromium viewport/etkileşim matrisi PASS durumundadır. Branch, Draft PR ve exact-head CI kanıtı tamamlanmadan genel GATE 2 PASS verilmez.

## PASS koşulları

- 25/25 canonical route ve 5/5 legacy alias doğrulanır.
- 21 ürün ekran ailesinde orphan veya duplicate yoktur.
- Operasyon akışı: günlük görünüm → izin → program → yoklama → bilgilendirme → reset.
- Yedek seçilmeden izin kararı, eksik yoklamayla kilit ve uygun olmayan kanalda bildirim engellenir.
- Fixture ve scenario hard-refresh snapshot’ı aynı seed ile deterministiktir.
- Runtime network, auth, cookie, storage, rastgelelik ve gerçek PII taraması sıfır bulgu verir.
- Claim taraması yasak production iddiası bulmaz.
- Static output allowlist ile üretilir ve serverless function sayısı sıfırdır.
- GET/HEAD, MIME, CSP, unknown asset 404 ve mutating method 405 testleri geçer.
- Chromium matrisi 1440×900, 1280×800, 1024×768 ve 768×1024 boyutlarında 28/28 ekran görüntüsü üretir.
- Browser QA; doğru ekran render’ı, görünür 404, alias, query sanitizasyonu, hard refresh, back/forward, focus trap, drawer focus return, yatay taşma ve P0 primary-action akışını doğrular.
- Browser sınırı; console error, XHR/fetch/WebSocket, dış origin, cookie, local/session storage ve IndexedDB için sıfır bulgu gerektirir.

## Bu GATE’in kanıtlamadığı alanlar

- Hosted Vercel URL
- Preview Protection erişimi
- Exact GitHub head üzerindeki CI ve browser artifact sonucu
- Production API/backend entegrasyonu
- Faz 2–3 ekranlarının yüksek sadakatli etkileşimi
