# #482 — Stratejik hedefler deploy flag'i + `/context` capability

**Durum:** IMPLEMENTING → VERIFYING (yerel); MERGE_ELIGIBLE değil
**Repo:** sisbas/OkulYonetimSaaS
**Base SHA:** `a80d4196f5ca13658e58862cb8692466f6dbc9e8` (origin/main, 2026-10-27 fetch)
**Branch:** `cline/63fnt985` (tek yazar; commit/push yapılmadı — kullanıcı istemedi)
**Issue:** #482 (bağımlılık #467 main'de birleşmiş)
**İlgili kararlar:** ADR 0003 D2/D3; CONTEXT K-43/K-44/K-45

## Görev sözleşmesi

| Alan | Değer |
|---|---|
| goal | `STRATEGIC_GOALS_ENABLED` (varsayılan kapalı) ile stratejik hedefler yüzeyini deploy seviyesinde açmak; `/context` yanıtına sürümlü `capabilities` sinyali eklemek |
| write_set | `src/common/config/feature-flags.ts`, `src/common/config/feature-flags.spec.ts`, `src/app.module.ts`, `src/app.module.spec.ts`, `src/rbac/context-catalog.service.ts`, `src/rbac/security-context-services.spec.ts`, `test/runtime-integration/api-routing-authority.spec.ts`, `test/database/strategic-goals-flag.spec.ts`, `.env.example` |
| read_set | `docs/adr/0003-*`, `CONTEXT.md` (K-43…K-45), `src/strategic-goals/**`, `src/rbac/*`, CI workflows |
| invariants | Tenant izolasyonu değişmez; `permissions` kanalı (K-43) değişmez; yeni izin kodu yayımlanmaz; flag yoksa route kaydı yok (404); DB migration yok |
| risk | medium (yeni deploy anahtarı + HTTP yüzeyi görünürlüğü) |
| rollback | `STRATEGIC_GOALS_ENABLED=false` + restart; kod rollback = commit revert (migration yok) |
| stop_condition | AC'ler kanıtlandı veya somut engel (PostgreSQL yok → DB kanıtı CI'ya) |

## AC eşlemesi

| AC | Durum | Kanıt |
|---|---|---|
| `STRATEGIC_GOALS_ENABLED` okunur; tanımsız/false/geçersizde kapalı | implemented | `src/common/config/feature-flags.ts:19`; `feature-flags.spec.ts` 7 vaka |
| Flag açıkken `/context.capabilities` içinde `strategic_goals`; kapalıyken yok, diğer alanlar değişmez | implemented | `context-catalog.service.ts:140`; `security-context-services.spec.ts` "capabilities contract (#482)" |
| `CONTEXT_CATALOG_VERSION` bump + sözleşme testi | implemented | `context-catalog:v2`; `security-context-services.spec.ts:297`; `api-routing-authority.spec.ts:393` |
| Flag kapalıyken `/strategic-goals*` 404 | implemented + yerel HTTP kanıtı / DB kanıtı CI'da | `src/strategic-goals/strategic-goals-feature-gate.spec.ts` (DB'siz Nest HTTP 404 PASS); gerçek AppModule + PostgreSQL: `test/database/strategic-goals-flag.spec.ts` (yerelde skip) |
| Flag açıkken #457 davranışı korunur; izin kodları yanıtta görünmez | implemented (mevcut testler) / kısmi | Mevcut strategic-goal DTO/service/repo testleri `npm test` içinde yeşil; capability izin kodu değil. `permissions` alanı K-43 gereği mevcut davranışını korur (aşağıdaki çelişki notu) |
| Birim testleri + `npm test` yeşil | implemented | `npm run lint` EXIT 0; `npm test -- --runInBand` 151 passed / 15 skipped (DB), 1378 test passed; `npm run test:rbac` 123 passed; `npm run build` EXIT 0 |

## Çalıştırılan komutlar (yerel)

- `npm ci` → EXIT 0 (Node v24.22.1; repo `engines.node: 22.x` uyarısı — CI Node 22 kullanır)
- `npm run lint` → EXIT 0, çıktı boş
- `npm test -- --runInBand` → `Test Suites: 15 skipped, 152 passed`; `Tests: 157 skipped, 1379 passed`; EXIT 0
- `npm run test:rbac` → 8 suite / 123 test PASS
- `npx jest src/app.module.spec.ts src/common/config/feature-flags.spec.ts src/rbac/security-context-services.spec.ts` → 37 test PASS
- `npx jest test/runtime-integration/api-routing-authority.spec.ts` → 19 test PASS
- `npx jest src/strategic-goals/strategic-goals-feature-gate.spec.ts` → 1 test PASS (DB'siz HTTP 404)
- `npm run build` → EXIT 0
- `npx jest test/database/strategic-goals-flag.spec.ts` → 1 suite skipped (DATABASE_URL yok) → gerçek AppModule/PostgreSQL kanıtı **CI DB Smoke'ta zorunlu** (yerelde NOT_VERIFIED)

### Mutasyon kontrolü

- `buildFeatureModules` koşulunu kaldır → `evaluates the feature gate…` FAIL (2 failed) → geri alındı → PASS.
- `capabilities: contextCapabilities()` yerine `[]` → iki capability testi FAIL → geri alındı → PASS.

## Push/PR hazırlığı (yetki bekliyor)

- PR gövdesi: `artifacts/gh-482/pr-body.md` (8 zorunlu governance bölümü dolu; CI URL'leri draft run sonrası eklenecek).
- Plan: `git add` → commit (`feat(strategic-goals): gate surface behind deploy flag (Refs #482)`) → `git push -u origin cline/63fnt985` → **draft** PR (base `main`) → CI terminal sonuçları → gövdeye run URL'leri → ready_for_review.
- Required kontroller (ruleset `main-merge-governance`): Backend CI, DB Smoke, Sprint 1 Quality Gate, Gate 1 CI, Sensitive Pattern Scanner, PR Governance ×4, GitGuardian scan.
- İnsan kapısı: merge ve üretim yayını bu PR ile açılmaz; bağımsız reviewer atanması gerekir.

## Açık sınırlılıklar / çelişkiler

1. **Yerel PostgreSQL yok** (psql/pg_ctl yok, 5432 kapalı, DATABASE_URL yok): DB'ye bağlı 15 suite skip; #482'nin gerçek HTTP 404 kanıtı CI DB Smoke'ta koşacak. Bu bir ürün hatası değil, ortam önkoşuludur.
2. **ADR 0003 D3 ile CONTEXT K-43 çelişkisi:** ADR "katalog izin kodu yayımlamaz" derken, main'deki #445/K-43 uygulaması `ContextCatalog.permissions` alanıyla makine-okur izin anahtarları yayımlar. #482 bu kanalı DEĞİŞTİRMEZ (kapsam dışı); capability ayrı ve izin kodu içermeyen bir alandır. Karar önceliği CONTEXT (K-43) lehinedir; ADR metninin düzeltilmesi ayrı doküman işidir.
3. **Commit/push/PR yok:** yürütme ortamı kuralı gereği kullanıcı istemeden commit/push yapılmadı. Bu nedenle exact head SHA, CI URL'si ve bağımsız review kapısı yok → MERGE_ELIGIBLE değil.
4. **Bağımsız reviewer yok:** aynı ajanın ikinci rolü bağımsız kapı sayılmaz; review açık.
