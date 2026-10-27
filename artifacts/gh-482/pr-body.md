## Amaç

#482 — Stratejik hedefler yüzeyini deploy seviyesinde, varsayılan **kapalı** tek anahtarla açmak ve `/context` yanıtına sürümlü, izin kodu içermeyen bir `capabilities` sinyali eklemek. ADR 0003 D2/D3'ün uygulama dilimidir; #483 (runtime ekranı) bu dilim birleşmeden güvenli başlayamaz.

## Kapsam

- `STRATEGIC_GOALS_ENABLED` env anahtarı; yalnız literal `true` açar, tanımsız/`false`/`1`/`TRUE`/boşluklu değerler kapalı (fail-closed).
- `src/app.module.ts`: `buildFeatureModules()` — flag kapalıyken `StrategicGoalsModule` hiç kaydedilmez; route router'da olmadığı için istek 401/403 değil **404** alır (varlık sızdırmaz).
- `ContextCatalog.capabilities: string[]` + `CONTEXT_CATALOG_VERSION` `context-catalog:v1` → `v2`. Flag açıkken `strategic_goals` anahtarı döner; `permissions` kanalı (K-43) değişmez.
- `.env.example` ve testler: flag ayrıştırma, capability açık/kapalı, statik modül kaydı sözleşmesi, DB'siz HTTP 404 ve gerçek AppModule + PostgreSQL 404 spec'i.
- Sözleşme tüketicisi `test/runtime-integration/api-routing-authority.spec.ts` v2'ye güncellendi.

## Kapsam dışı

- Tenant bazlı `strategic_goals_enabled` kolonu/ayar uç noktası.
- Frontend ekranı, sekme görünürlüğü ve ayrı frontend bayrağı (#483/#484).
- Mevcut sekmelerin capability sözleşmesine taşınması (ADR 0003 açık sorusu).
- `permission-catalog.ts` içindeki `strategic_goal.manage` `audit_required` kararı (#467 açık sorusu).
- `ContextCatalog.permissions` alanının kaldırılması; K-43 gereği mevcut davranış korunur.

## Acceptance criteria

- [x] `STRATEGIC_GOALS_ENABLED` okunur; tanımsız, `false`, `1`, `TRUE`, boşluklu değerlerde kapalı davranır (7 vaka).
- [x] Flag açıkken `/context.capabilities` içinde `strategic_goals` bulunur; kapalıyken boş dizi döner ve diğer alanlar değişmez.
- [x] `CONTEXT_CATALOG_VERSION` `context-catalog:v2` oldu; sözleşme testleri yeni alanı doğruluyor.
- [x] Flag kapalıyken `POST/GET/PATCH/DELETE /strategic-goals*` 404 döner (DB'siz HTTP spec'i PASS; gerçek AppModule + PostgreSQL spec'i CI DB Smoke'ta koşar).
- [x] Flag açıkken #457 davranışı korunur; capability izin kodu değildir, yeni `strategic_goal:*` anahtarı yayımlanmaz.
- [x] Birim testleri ve tam Jest suite'i yerelde yeşil; `npm run lint` ve `npm run build` EXIT 0.

## Test çıktısı

- `npm run lint` → EXIT 0 (tsc çıktısı boş).
- `npm test -- --runInBand` → Test Suites: 152 passed, 15 skipped; Tests: 1379 passed, 157 skipped; EXIT 0.
- `npm run test:rbac` → 8 suite / 123 test PASS.
- `npx jest src/app.module.spec.ts src/common/config/feature-flags.spec.ts src/rbac/security-context-services.spec.ts src/strategic-goals/strategic-goals-feature-gate.spec.ts` → PASS.
- `npx jest test/runtime-integration/api-routing-authority.spec.ts` → 19 test PASS.
- `npm run build` → EXIT 0.
- `npx jest test/database/strategic-goals-flag.spec.ts` → yerelde 1 suite skipped (PostgreSQL yok); DB Smoke'ta `test:database:required` altında skip yasağıyla koşacak.
- Mutasyon kontrolü: kapı koşulu kaldırılınca ve `capabilities` sabitlenince ilgili testler FAIL; geri alınınca PASS.
- Backend CI: PR açılışında tetiklenecek draft run (URL `CI run referansı` bölümüne yazılacak).

## KVKK/audit etkisi

- KVKK etkisi: yok — yeni alan öğrenci/veli/öğretmen kişisel verisi, iletişim bilgisi veya sağlık gerekçesi taşımaz; yalnız deploy yüzeyi anahtarıdır. Tenant izolasyonu değişmez.
- Audit etkisi: yok — audit metadata/allowlist, outbox payload veya log formatı değişmez; `@Permissions` guard'ları ve `404` non-enumerating sözleşmesi korunur.
- Redaction ihtiyacı: yok — `capabilities` makine-okur ürün anahtarıdır, kişisel veri değildir.

## Rollback

- Deploy seviyesinde anahtarı `STRATEGIC_GOALS_ENABLED=false` yapıp yeniden başlatmak yeterlidir; capability aynı anda düşer ve route'lar 404 olur.
- Kod geri dönüşü gerekirse bu PR revert edilir; migration yok, veri dönüşümü yok, tenant ayarı yok.
- `context-catalog:v2` tüketicisi için geri dönüş tek commit revert'idir; şema değişmediği için restore gerekmez.

## CI run referansı

- PR: https://github.com/sisbas/OkulYonetimSaaS/pull/499 (draft, head `c741892`)
- Backend CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227274 — SUCCESS
- DB Smoke: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227144 — SUCCESS (`PASS test/database/strategic-goals-flag.spec.ts`, zorunlu koşuda skip yok)
- Gate 1 CI: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227270 — SUCCESS
- Sprint 1 Quality Gate: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227349 — SUCCESS
- Sensitive Pattern Scanner: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227375 — SUCCESS
- GitGuardian scan: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227654 — SUCCESS
- PR Governance: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227413 — SUCCESS
- P0 browser E2E: https://github.com/sisbas/OkulYonetimSaaS/actions/runs/40490227145 — bu gövde yazıldığında devam ediyordu; terminal sonuç PR checks'tadır.
- Not: PR Draft'tır. Merge/ready_for_review, terminal required-check sonuçları ve bağımsız review sonrası insan kararıdır.

## Issue reference

Refs #482
