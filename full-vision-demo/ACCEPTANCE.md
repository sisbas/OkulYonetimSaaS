# GATE 2 Kabul Kanıtı

## Mevcut karar

**GATE 2 PASS.** PR #127 üzerinde exact-head statik kontrat, 4/4 viewport Chromium matrisi, 28/28 ekran kanıtı ve güvenlik taramaları tamamlandı. Hosted Vercel release ayrı bir kapıdır; `/full-vision/*` mount'u için exact-head CI ve immutable preview kanıtı tamamlanana kadar hosted karar HOLD kalır.

## 11 Ağustos 2026 — CMO loop eki: release konumu korunur

Routing authority integration evidence'nin merge edilmesi (PR #197/#198, wp07f-195: production `/api/v1` route'larının Nest'e ulaşması, Vercel rewrite taşıma, kontrollü JSON hata shape'i) **GATE 2 kararını değiştirmez ve commercial release readinessi ispatlamaz**:

- Kanıt yalnız network yolunun açık olduğunu ve hata shape'inin Nest kontrolünde olduğunu gösterir; auth korumalı route'lar kontrollü `401` döner.
- Faz 1 MVP modül tamamlama, security/KVKK/audit kapanışı, imzalı veri sözleşmeleri ve hosted release onayı ayrı kapılardır ve açık değildir.
- "Routing kanıtı merge edildi" ifadesi hiçbir kanıt zincirinde "commercial release ready" iddiasına çevrilemez.

Demo anlatısı güncellendi: **Ders Programı → İzin → Günlük Operasyon**. Anlatı yalnız mesajlama düzeyinde taşınır; deterministik P0 durum akışı (günlük görünüm → izin → program → yoklama → bilgilendirme → reset) ve sıralama bağımlılıkları (program kabulü olmadan yoklama kilitlenmez, yoklama kilidi olmadan bildirim simüle edilmez) değişmedi.

**Yoklama ve Veli Bilgilendirme planning-only sınır mesajları korunur:** yoklama yalnız kodlu sentetik öğrenciler üzerinde iş akışı gösterir ve öğrenci/kurum kaydı işlemez; bildirim gerçek mesaj göndermez, yalnız gönderim simülasyonu tamamlar.

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

- Hosted Vercel URL ve anonim erişim
- Preview Protection erişimi
- Hosted-release exact head'i üzerindeki birleşik output ve browser kanıtı
- Production API/backend entegrasyonu
- Faz 2–3 ekranlarının yüksek sadakatli etkileşimi

## 24 Temmuz 2026 ek kabul sınırı

Bu branch, ana repo içindeki demo özelliklerini geliştirme çalışmasıdır. Önceki GATE 2 PASS kararını production/runtime kararı hâline getirmez.

- İzin onayı ile yedek ders kapsaması ayrı durumdur.
- Yönetici, demo içinde açık ders kalırken onayı simüle edebilir.
- Açık kalan dersler Günlük Operasyon metriğinde ve program önizlemesinde görünür kalmalıdır.
- Program Stüdyosu `generate` ve `diagnostics` sekmeleri boş placeholder değildir; hazır simülasyon sonucu, gevşetme aşamaları, sınıf/öğretmen kısıtı ve denge analizi gösterir.
- Bu sekmeler canlı işlem, kalıcı kayıt, gerçek program yayını veya dış sistem bağlantısı iddiası taşıyamaz.
