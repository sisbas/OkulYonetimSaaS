# R4 — Sunucu-tek-kaynak güvenlik bağlamı + protected endpoint default-deny (Refs #339)

> **Durum:** PR **açılmadı** — A7 doğrulaması (GO) + ORCH onayı bekleniyor. Bu dosya PR gövdesi taslağıdır.

## Amaç

Protected endpoint yetkilendirmesini **default-deny** hâline getirmek ve istek bağlamını (kullanıcı, kurum, şube,
aktif rol, efektif izin) **tamamı sunucudan** çözmek. İstemcinin gönderdiği tenant/şube/rol/izin değerleri artık
hiçbir yolda yetki kaynağı değildir.

## Kapsam

| # | Kapsam maddesi | Nerede |
|---|---|---|
| 1 | `RequestContext` genişletmesi: user + tenant + branch + aktif rol + efektif izin (tamamı sunucudan) | `src/common/context/request-context.ts`, `authorization-context.ts` |
| 2 | Protected endpoint default-deny (fail-closed); istemci beyanı yetki üretmez | `src/common/guards/permission.guard.ts`, `permission-authentication.guard.ts`, `public-route.ts` |
| 3 | Versioned context/catalog uç noktası (insan-okur adlar; iç UUID/ETag/jargon yok) | `src/rbac/context-catalog.controller.ts`, `context-catalog.service.ts`, `dto/context-branch-select.dto.ts` |
| 4 | Rol/izin çözümleme + önbellek geçersizleştirme (`token_version` uyumlu) | `src/rbac/authority-resolver.service.ts` |
| 5 | Non-enumerating hata sözleşmesi (403/404 ayrımı bilgi sızdırmaz) | `src/common/context/deny-response.ts` |
| 6 | Audit metadata allowlist + redaksiyon | `src/common/context/context-audit.ts` |
| 7 | `test/rbac/controller-enforcement-consistency.spec.ts` kapsamının default-deny ile genişletilmesi | `test/rbac/controller-enforcement-consistency.spec.ts`, yeni `test/rbac/security-context-default-deny.spec.ts` |
| — | Şube kapsamı (sunucu tarafı yetkilendirme) | `src/rbac/branch-scope.service.ts` |

**Ortak dosya değişikliği yok:** `src/app.module.ts`, `package.json`, `src/database/data-source.ts` dokunulmadı
(guard sıralaması `PermissionAuthenticationGuard → PermissionGuard` korunur; `TenantScopeGuard` controller düzeyinde
`AuthGuard('jwt')` sonrası çalışmaya devam eder).

## Kapsam dışı

İş mantığı (leave/attendance/notification), frontend yeniden tasarımı, JWT algoritması, reports/eokul.
`src/auth/**` (kimlik doğrulama) ve `src/common/audit/**` (mevcut güvenlik audit servisi) değiştirilmedi.

## Kabul kriterleri

| AC | Durum | Kanıt |
|---|---|---|
| (a) context yokken protected controller fail-closed | PASS (yerel) | `test/rbac/controller-enforcement-consistency.spec.ts` default-deny bloğu + mutasyon kontrolü |
| (b) client tenant/branch/rol değerleri yetki veremez | PASS (yerel) | aynı dosya + `test/rbac/security-context-default-deny.spec.ts` (DTO/pipe 400) |
| (c) cross-tenant/branch/escalation/missing-permission negatifleri | PASS (yerel) | `artifacts/R4/evidence.md` negatif matris N1–N15 |
| (d) catalog yalnız erişilebilir kayıtları okunabilir adlarla döner | PASS (yerel) | `src/rbac/security-context-services.spec.ts` |
| (e) mevcut regresyonlar (rbac/kvkk/database) yeşil | PASS | 100/108 suite; `test/database` 8 suite PostgreSQL kapalı → skip (CI DB Smoke bekliyor) |
| (e+) güvenlik bağlamı bileşenlerinin modül kaydı/DI sözleşmesi | PASS (yerel, statik+unit) | `src/rbac/security-context-services.spec.ts` › *RbacModule security-context wiring (module registry)* — gerçek grafiğin çözümü CI uygulama açılışında kanıtlanır |
| (f) şema değiştiyse fresh PostgreSQL kanıtı | N/A | Şema/migration değişmedi |

## Test çıktısı (yerel, main bazı `15c5ab8`)

```text
npx tsc -p tsconfig.json --noEmit
→ exit 0, stdout boş

npx jest --runInBand src test/rbac test/kvkk test/database test/contracts
→ Test Suites: 8 skipped, 100 passed, 100 of 108 total
→ Tests:       32 skipped, 858 passed, 890 total   (62.3 s)
   (8 suite skip = test/database/** — yerel PostgreSQL kapalı: "yerel skip, CI kanıtı")

npx jest --runInBand test/runtime-integration          → 5/5 suite · 52/52 test PASS (baz 15c5ab8 ile eşit)
npx jest --config ./test/jest-acceptance-guard.json    → 1/1 suite · 11/11 test PASS

npx jest --runInBand test/rbac test/kvkk test/contracts
→ Önce: 23 suite / 212 test PASS  →  Sonra: 24 suite / 234 test PASS
```

**Komşu süit regresyonu (bulundu + düzeltildi):** ilk turda `test/runtime-integration` içinde 2 test `400` yerine `500`
döndü (yeni guard'ın veri kaynağı bağımlılığı, JWT katmanı stub'lanmış süitte karşılıksız kaldı). Düzeltme: guard
altyapı hatasında sunucu-çözümlü **oturum yetkisine** gürültülü şekilde düşer (şube seçimini uygulamaz, ek yetki
üretmez); düzeltme sonrası 52/52 PASS. Ayrıntı: `artifacts/R4/evidence.md`.

**Mutasyon kontrolü:** `PermissionGuard` default-deny satırı geçici olarak `return true;` yapıldı →
`Test Suites: 2 failed` / `Tests: 2 failed, 34 passed` (ilgili negatifler kırmızı) → geri alındı →
`Test Suites: 2 passed` / `Tests: 36 passed`.

## RBAC / KVKK / audit etkisi

- **RBAC:** Erişim sınıfı beyanı zorunlu (`@Permissions(...)` ya da allowlist'li `@ContextScoped()`); beyan yoksa
  erişim reddedilir. Efektif izinler sunucudan (`AuthorityResolverService` → DB) çözülür; `users.token_version`
  artırıldığında eski girdiler geçersizleşir. Yeni uç noktalar `role:...` izinlerini **genişletmez**: `/context`
  yalnız çağıranın kendi erişilebilir kurum/şubelerini döndürür (self-scope).
- **KVKK:** Katalog yanıtı yalnız kurum/şube ADI ve rol ETİKETİ döndürür; iç UUID, ETag, izin kodu, e-posta/telefon/ad
  dönmez. Audit olayları allowlist tabanlıdır ve `body`/`headers`/`authorization`/`cookie`/`token`/`email`/`phone`/
  `fullName` alanlarını atar; allowlist içi hassas görünümlü değerler `[redacted]` ile maskelenir. Redaksiyon
  taraması: üretim kodu + artefakt **bulgu = 0**.
- **Audit:** Red kararları tek olay/red ilkesiyle kaydedilir (mevcut `security.audit` kanalı desteklediği kodlar için,
  diğer durumlarda allowlist tabanlı `security.context.denied` olayı). Bu dilim **domain mutasyonu yapmaz** →
  transaction içi audit kuralı kapsam dışıdır (şema/domain yazımı yok).

## Rollback

1. `git revert <R4-sha>` — şema/migration yok, veri dönüşümü yok.
2. Acil durumda `PermissionGuard` default-deny bloğu geçici olarak `return true;` yapılır (prova edildi; kalıcı
   hâle getirilmesi güvenlik regresyonu olarak kaydedilir).
3. Katalog uç noktası `rbac.module.ts` içindeki `controllers` listesinden çıkarılarak kapatılabilir.
4. `AUTHORITY_CACHE_TTL_MS=0` ile önbellek kapatılabilir.

## CI referansı

**Bekliyor** — PR açılmadığı için run URL'i yok. PR açıldığında zorunlu kapılar:
`Backend CI`, `Sprint 1 Quality Gate`, `DB Smoke`, `Gate 1 CI`, `PR Governance`, `P0 browser E2E and artifact evidence`.
`DB Smoke` çıktısı, yerelde skip olan `test/database` suite'lerinin gerçek-PostgreSQL kanıtı olarak bu gövdeye eklenecektir.

## Boyut

Toplam **+2.712/−60** (21 dosya): üretim kodu 1.350 · test/spec 1.096 · doküman/artefakt 266. Dilim hedefinin
(~1.500) üstünde; gerekçe ve önerilen bölme planı `artifacts/R4/evidence.md` “Açık boşluklar” §2'de.
