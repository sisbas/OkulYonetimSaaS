# Demo Frontend Architecture

## Değerlendirilen seçenekler

1. NestJS içinde server-rendered demo: backend ile gereksiz bağ oluşturur.
2. Vite/React alt uygulaması: uzun vadede güçlüdür ancak bu sunum prototipi için yeni bağımlılık ve build zinciri getirir.
3. Bağımsız statik SPA: gerçek API/auth/permission katmanına dokunmadan hızlı, deterministik ve taşınabilir sunum sağlar.

## Karar

Demo için bağımsız statik SPA kullanılır. Uygulama `demo-frontend/` altında tutulur; `/demo/*` route fallback'i `vercel.json` ile sağlanır.

## Sınırlar

- Deterministik sentetik veri
- Ağ isteği yok
- Auth ve permission binding yok
- Gerçek PII yok
- Yalnız tarayıcı belleğinde geçici etkileşim state'i
- Her ekranda görünür `Demo Verisi` etiketi

## Sonraki geçiş

Bu demo production frontend başlangıcı değildir. Runtime frontend workspace, API binding ve permission enforcement ayrı mimari karar ve PR gerektirir.
