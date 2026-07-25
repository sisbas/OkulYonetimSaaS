# Full-Vision Demo — Hosted Release Kararı

## Amaç

Merge edilen GATE 2 statik demosunu mevcut eski demoyu bozmadan Vercel preview üzerinde yayımlamak. Production backend, API, auth, veritabanı ve kalıcı tarayıcı durumu bu release'in kapsamı dışındadır.

## Mimari karşılaştırma

| Seçenek | Değerlendirme | Karar |
|---|---|---|
| Ayrı Vercel static project | En güçlü izolasyon; yeni Vercel Project ve Root Directory ayar yetkisi gerektirir | Dashboard yetkisi olmadığı için ertelendi |
| Root'tan birleşik bounded static output | Mevcut GitHub–Vercel bağlantısıyla repo kontrollü; iki açık allowlist'i tek output'ta birleştirir | **Seçildi** |
| NestJS serverless runtime | DB/env/auth, cold-start ve function crash yüzeyi açar | Reddedildi |

## Route ve çıktı sözleşmesi

- Eski demo: `/demo/*` → `demo-frontend/index.html`.
- Full-Vision: `/full-vision/*` → `full-vision-demo/index.html`.
- Deployment kökü `/`, paylaşılabilir preview'ın doğrudan görünmesi için `/full-vision/overview` adresine yönlenir.
- Eski beş ekranın route, fixture ve etkileşim davranışı değiştirilmez.
- Full-Vision canonical route ve kısa alias'ları yalnız `/full-vision/*` alanındadır.
- Birleşik output yalnız 5 eski demo dosyası ve 10 Full-Vision runtime dosyası içerir.
- Serverless function, API rewrite, package veya environment variable eklenmez.

## Güvenlik sınırı

- Full-Vision tamamen sentetik, kodlu ve deterministik fixture kullanır.
- API, XHR/fetch, WebSocket, auth, cookie, local/session storage, IndexedDB ve gerçek bildirim yoktur.
- Hosted Full-Vision route ve asset yanıtlarında strict CSP, `no-referrer`, `nosniff`, `noindex` ve kısıtlı Permissions Policy uygulanır.
- Korunan eski demo ayrı bir tarihsel prototiptir; bu belge onun kurum etiketlerini “tamamen sentetik” olarak nitelemez.

## Kabul kapısı

1. Birleşik bounded output, 0 serverless function.
2. Eski 5 route ve 4 asset regresyonu PASS.
3. Full-Vision 25 canonical route, 5 alias, 10 runtime dosyası, MIME, 404/405 ve güvenlik başlıkları PASS.
4. Dört viewport, 28 ekran, P0 akış, hard-refresh/history ve console/network/storage matrisi PASS.
5. Exact-head GitHub CI ve Vercel preview `Ready`.
6. Immutable preview üzerinde HTTP ve gerçek browser doğrulaması.
7. Preview Protection anonim erişimi engelliyorsa karar PRESENTATION NO-GO kalır.

## Mevcut karar

**HOLD — follow-up Draft PR, exact-head CI ve immutable hosted preview kanıtı bekleniyor.**
