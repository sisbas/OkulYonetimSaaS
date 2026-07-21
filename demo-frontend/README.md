# Okul Yönetim SaaS — Demo Frontend

Bu klasör, gerçek API, auth veya permission binding kullanmayan bağımsız ve tıklanabilir bir sunum prototipidir.

## Demo route'ları

- `/demo/today`
- `/demo/schedule`
- `/demo/leave/LV-204`
- `/demo/attendance/session/AT-1204`
- `/demo/notifications`

Dinamik segmentler herhangi bir sentetik kimlikle açılabilir; ekran içeriği deterministik fixture setinden gelir.

## Güvenlik sınırları

- Ağ isteği yoktur.
- Auth veya token işleme yoktur.
- Permission key veya route guard binding yoktur.
- Gerçek öğrenci, veli veya guardian verisi yoktur.
- Tüm ekranlarda görünür `Demo Verisi` etiketi vardır.
- Etkileşimler yalnız sayfa belleğindeki state'i değiştirir.

## Yerel doğrulama

```bash
node demo-frontend/smoke-test.js
python3 -m http.server 4173
```

Ardından `http://localhost:4173/demo-frontend/index.html` adresi açılabilir. Production benzeri `/demo/*` route fallback'i `vercel.json` tarafından sağlanır.
