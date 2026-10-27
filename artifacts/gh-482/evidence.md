# #482 — Stratejik hedefler deploy flag'i + `/context` capability

**Durum:** VERIFYING — draft PR açıldı; required CI ilk turu büyük ölçüde yeşil, bağımsız review yok
**Repo:** sisbas/OkulYonetimSaaS
**Base SHA:** `a80d4196f5ca13658e58862cb8692466f6dbc9e8` (origin/main, 2026-10-27 fetch)
**Branch:** `cline/63fnt985`
**PR:** https://github.com/sisbas/OkulYonetimSaaS/pull/499 (draft, base `main`)
**İlk head SHA:** `c74189217e9a07d1d9b84a5892e04b9b66fdace6`
**Issue:** #482 (bağımlılık #467 main'de birleşmiş)
**İlgili kararlar:** ADR 0003 D2/D3; CONTEXT K-43/K-44/K-45

## Görev sözleşmesi

| Alan | Değer |
|---|---|
| goal | `STRATEGIC_GOALS_ENABLED` (varsayılan kapalı) ile stratejik hedefler yüzeyini deploy seviyesinde açmak; `/context` yanıtına sürümlü `capabilities` sinyali eklemek |
| write_set | `src/common/config/feature-flags.ts`, `src/common/config/feature-flags.spec.ts`, `src/app.module.ts`, `src/app.module.spec.ts`, `src/rbac/context-catalog.service.ts`, `src/rbac/security-context-services.spec.ts`, `test/runtime-integration/api-routing-authority.spec.ts`, `test/database/strategic-goals-flag-off.spec.ts + test/database/strategic-goals-flag-on.spec.ts`, `.env.example`, `artifacts/gh-482/**` |
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
| Flag kapalıyken `/strategic-goals*` 404 | implemented; gerçek grafik kanıtı CI'da | Gerçek `AppModule` + PostgreSQL: `test/database/strategic-goals-flag-off.spec.ts + test/database/strategic-goals-flag-on.spec.ts` (5 method 404 + Nest 404 zarfı; yerelde skip). DB'siz module-less HTTP testi kanıt sayılmadığı için kaldırıldı (review MAJOR 2) |
| Flag açıkken route kaydı | implemented; gerçek grafik kanıtı CI'da | Aynı spec, ikinci test: `STRATEGIC_GOALS_ENABLED=true` → GET/POST 401 (404 değil). Statik kablolama: `app.module.spec.ts` `...buildFeatureModules()` assertion'ı (review MAJOR 1) |
| Flag açıkken #457 davranışı korunur; izin kodları yanıtta görünmez | implemented (mevcut testler) / kısmi | Mevcut strategic-goal DTO/service/repo testleri `npm test` içinde yeşil; capability izin kodu değil. `permissions` alanı K-43 gereği mevcut davranışını korur (aşağıdaki çelişki notu) |
| Birim testleri + `npm test` yeşil | implemented | `npm run lint` EXIT 0; `npm test -- --runInBand` 151 passed / 16 skipped (DB), 1379 test passed; `npm run test:rbac` 123 passed; `npm run build` EXIT 0 |

## Çalıştırılan komutlar (yerel)

- `npm ci` → EXIT 0 (Node v24.22.1; repo `engines.node: 22.x` uyarısı — CI Node 22 kullanır)
- `npm run lint` → EXIT 0, çıktı boş
- `npm test -- --runInBand` → `Test Suites: 16 skipped, 151 passed`; `Tests: 158 skipped, 1379 passed`; EXIT 0
- `npm run test:rbac` → 8 suite / 123 test PASS
- `npx jest --runInBand src/app.module.spec.ts src/common/config/feature-flags.spec.ts src/rbac/security-context-services.spec.ts` → 39 test PASS
- `npx jest --runInBand test/runtime-integration/api-routing-authority.spec.ts` → 19 test PASS
- `npm run build` → EXIT 0
- `npx jest --runInBand test/database/strategic-goals-flag-off.spec.ts test/database/strategic-goals-flag-on.spec.ts` → 2 test skipped (DATABASE_URL yok) → gerçek AppModule/PostgreSQL 404+401 kanıtı **CI DB Smoke'ta zorunlu** (yerelde NOT_VERIFIED)

### Mutasyon kontrolü

- `buildFeatureModules` koşulunu kaldır → `evaluates the feature gate…` FAIL (2 failed) → geri alındı → PASS.
- `capabilities: contextCapabilities()` yerine `[]` → iki capability testi FAIL → geri alındı → PASS.
- `imports` içinden `...buildFeatureModules()` sil → statik kablolama assertion'ı + boot-snapshot testi FAIL (2 failed) → geri alındı → PASS (review MAJOR 1).
- Capability'yi boot'ta sabitleme (`this.capabilities = ...`) yerine boş dizi → boot-snapshot testi FAIL → geri alındı → PASS.

## PR ve CI kaydı

- PR **#499** — https://github.com/sisbas/OkulYonetimSaaS/pull/499; base `main`, head `cline/63fnt985`.
- **İnsan olayı:** repo sahibi `sisbas` 2026-10-27 11:02:46'da PR'ı `ready_for_review` yaptı (draft → ready). Merge hâlâ `BLOCKED`; onay/extra-approval insan kapısı.
- Head `e97a7e2` (review turu öncesi) required kontrolleri — tamamı SUCCESS:
  - Backend CI `40490812317`; DB Smoke `40490812349` (o head'de tek spec; yeni ayrık spec'lerin sonucu PR checks'tadır); Gate 1 `40490812243`; Sprint 1 `40490812540`; Sensitive Scanner `40490812416`; GitGuardian `40490812366`; PR Governance `40490812712`; P0 browser E2E `40490812339`.
- **Bağımsız ajan review'u (REVIEW turu 1):** ayrı bağlamlı salt-okunur inceleyici `REQUEST_CHANGES` verdi.
  - MAJOR 1: flag-ON yolu test edilmiyordu; `imports`'tan `...buildFeatureModules()` silinse suite yeşil kalıyordu. → statik kablolama assertion'ı + gerçek AppModule flag-ON 401 testi eklendi.
  - MAJOR 2: DB'siz "module-less app" 404 testi gerçek grafiği kanıtlamıyordu. → spec kaldırıldı; 404/401 kanıtı yalnız gerçek AppModule + PostgreSQL spec'ine bağlandı; 404 zarfı (statusCode + `Cannot <METHOD>`) sıkılaştırıldı.
  - MINOR: çift flag değerlendirme noktası (capability request-başına, route boot'ta) → capability boot anında sabitlendi + regresyon testi.
  - MINOR (kabul edilen, kod değişmedi): `permissions` K-43 gereği `strategic_goal:*` taşımaya devam eder (yetki kanalı); typo env için boot log'u eklenmedi (gürültü/AC dışı).
- Review düzeltmeleri bu kayıtla birlikte yeni bir commit olarak push edilir; **o head'in CI sonuçları PR checks'tan okunmalıdır**. Önceki run'lar yeni head için kanıt sayılmaz.
- Required kontroller (ruleset `main-merge-governance`): Backend CI, DB Smoke, Sprint 1, Gate 1, Sensitive Scanner, PR Governance ×4, GitGuardian. `strict=false`, approval=0, thread resolution zorunlu; unattributed commit'ler için ek onay isteniyor.
- İnsan kapısı: merge ve üretim yayını bu PR ile açılmaz; bağımsız **insan** review/onay gerekir.

## Açık sınırlılıklar / çelişkiler

1. **Yerel PostgreSQL yok** (psql/pg_ctl yok, 5432 kapalı, DATABASE_URL yok): DB'ye bağlı 15 suite yerelde skip; gerçek AppModule/PostgreSQL 404+401 kanıtı CI DB Smoke'ta alınır. Bu bir ürün hatası değil, ortam önkoşuludur.
2. **ADR 0003 D3 ile CONTEXT K-43 çelişkisi:** ADR "katalog izin kodu yayımlamaz" derken, main'deki #445/K-43 uygulaması `ContextCatalog.permissions` alanıyla makine-okur izin anahtarları yayımlar. #482 bu kanalı DEĞİŞTİRMEZ (kapsam dışı); capability ayrı ve izin kodu içermeyen bir alandır. Karar önceliği CONTEXT (K-43) lehinedir; ADR metninin düzeltilmesi ayrı doküman işidir.
3. **Bağımsız insan review yok:** ajan review'u bağımsız bağlamla yapıldı ve bulguları düzeltildi, ancak insan onayı yerine geçmez; `MERGE_ELIGIBLE`/kabul iddiası yok.
4. **PR durumu:** sahibi `ready_for_review` yaptı; merge `BLOCKED`. Bu oturum merge/approve yapmadı.
5. **Belge/kanıt head'i:** bu dosya review düzeltme commit'inden önce yazıldı; exact head ve terminal CI için PR sayfası esastır.
