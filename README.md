# Okul Yönetim SaaS — Sprint 0 Backend/API

Sprint 0, Faz 1 MVP modüllerinin üzerine kurulacağı minimum güvenlik çekirdeğini içerir. API global prefix'i `/api/v1` olarak ayarlanmıştır.

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
  database/migrations/
  database/seeds/
  rbac/
  tenants/
  users/
test/
  jest-e2e.json
```

## Sprint 0 teknik notları

- Auth: JWT access token ve refresh token rotation çekirdeği vardır; refresh token için yalnızca hash saklanmalıdır.
- Tenant context: Protected request'lerde JWT `tenant_id` ana kaynak kabul edilir; `X-Tenant-Id` uyuşmazlığı `403` üretir.
- RBAC: Route seviyesinde `@Permissions(...)` decorator ve global guard ile kontrol edilir.
- Audit: Kritik aksiyonlarda `@AuditAction(...)` kullanılır; interceptor hassas alanları maskeleyerek loglar.
- Tenant izolasyonu: Controller iskeletleri tenant dışı erişimde `404` döndürme desenini gösterir; gerçek repository sorguları her zaman `tenant_id` filtresi içermelidir.

## Test planı

- Tenant header/JWT uyuşmazlığı negatif testi.
- RBAC eksik permission negatif testi.
- RBAC geçerli permission pozitif testi.
- Refresh token hash doğrulama ve rotation testleri.
- Audit log redaction testleri.

## Komutlar

```bash
npm install
npm test
npm run build
```
