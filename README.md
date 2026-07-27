# Okul Yönetim SaaS — Backend API

Bu repository, Faz 1 MVP modüllerinin üzerine kurulacağı **backend-only NestJS API** çekirdeğini içerir. Tarayıcıda gezilecek frontend uygulaması veya Builder/Vercel preview ekranı beklenmez. API global prefix'i `/api/v1` olarak ayarlanmıştır.

## Backend-only kabul notu

Builder veya frontend preview sonucu bu repo için kabul kriteri değildir. Doğru doğrulama yolu şudur:

```text
npm install PASS
npm run build PASS
DATABASE_URL ile runtime PASS
/api/v1/health endpoint PASS
CI quality gate PASS
```

Runtime için canlı PostgreSQL bağlantısı gerekir. `DATABASE_URL` tanımlı değilse veya PostgreSQL erişilebilir değilse API süreci başlatılamaz; bu backend-only yapı için beklenen bir environment failure'dır, frontend preview failure'ı değildir.

## Üretilen dosya ağacı

```text
src/
  app.module.ts
  main.ts
  auth/
  common/context/
  common/decorators/
  common/guards/
  common/interceptors/
  courses/
  database/migrations/
  database/seeds/
  health/
  rbac/
  rooms/
  tenants/
  time-slots/
  users/
test/
  jest-e2e.json
```

## Teknik notlar

- Auth: JWT access token ve refresh token rotation çekirdeği vardır; refresh token için yalnızca hash saklanmalıdır.
- Tenant context: Protected request'lerde JWT `tenant_id` ana kaynak kabul edilir; `X-Tenant-Id` uyuşmazlığı `403` üretir.
- RBAC: Route seviyesinde `@Permissions(...)` decorator ve global guard ile kontrol edilir.
- Audit: Kritik aksiyonlarda `@AuditAction(...)` kullanılır; interceptor hassas alanları maskeleyerek loglar.
- Tenant izolasyonu: Repository sorguları her zaman `tenant_id` filtresi içermelidir.
- Health: `/api/v1/health` endpoint'i backend API'nin ayağa kalktığını doğrulamak için kullanılır; kişisel veri, token veya credential döndürmez.

## Komutlar

```bash
npm install
npm run build
npm test
```

## Development runtime

`@nestjs/cli` bağımlılığı zorunlu değildir. Development runtime mevcut bağımlılıklarla çalıştırılır:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/okul_yonetim_saas npm run start:dev
```

## Production-like runtime

Önce build alınır, sonra derlenmiş çıktı çalıştırılır:

```bash
npm run build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/okul_yonetim_saas npm run start
```

Ayrı terminalde health kontrolü:

```bash
curl http://localhost:3000/api/v1/health
```

Beklenen örnek yanıt:

```json
{
  "status": "ok",
  "service": "okul-yonetim-saas-api",
  "applicationType": "backend-api",
  "databaseRequired": true,
  "timestamp": "2026-07-22T00:00:00.000Z",
  "uptimeSeconds": 1
}
```

## DB doğrulama

```bash
npm run db:migrate
npm run db:verify
npm run db:seed:permissions
```

## Quality gate

```bash
npm run ci:sprint1
```
