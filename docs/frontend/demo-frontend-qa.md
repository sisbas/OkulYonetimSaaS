# Demo Frontend QA Acceptance

## Kapsam

- `/demo/today`
- `/demo/schedule`
- `/demo/leave/:id`
- `/demo/attendance/session/:id`
- `/demo/notifications`

## Statik kontroller

- Beş route kayıtlı.
- Tüm ekranlarda görünür `Demo Verisi` etiketi mevcut.
- Sentetik veri seed'i sabit: `OKUL-DEMO-2026-07-21-v1`.
- `fetch`, `XMLHttpRequest`, Axios, Authorization/Bearer, API path, localStorage, sessionStorage ve cookie kullanımı yok.
- HTML, CSS ve JavaScript ayrı statik dosyalarda.
- JavaScript sözdizimi `new Function` ile doğrulanıyor.
- Responsive breakpoint'ler mevcut.
- Vercel JSON yapılandırması parse edilebilir.

## Etkileşim kontrolleri

- SPA menü geçişleri ve browser back/forward desteği.
- Draft/yayınlanmış schedule görünümü.
- Conflict doğrulama simülasyonu.
- Ders detayı ve yeni event modalı.
- İzin yedek öğretmen seçimi.
- Yoklama durum değişikliği.
- Bildirim onay ve gönderim simülasyonu.
- Demo state sıfırlama.
- Beklenmeyen render hatası için güvenli fallback.

## Karar

Statik smoke test PASS. Browser preview ve Vercel deployment check'i PR CI/preview üzerinde ayrıca doğrulanmalıdır.
