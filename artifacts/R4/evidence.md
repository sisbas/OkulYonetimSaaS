# Evidence — R4 (#339) Sunucu-tek-kaynak güvenlik bağlamı + default-deny

- Baz main: `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae` · Branch: `p1b/security-context-default-deny` · Tarih: 2026-09-23
- Sahiplik: `src/common/context/**`, `src/common/guards/**`, `src/common/tenant/**`, `src/rbac/**` (+ madde 7 gereği `test/rbac/controller-enforcement-consistency.spec.ts` genişletmesi).
- Ortak dosya değişikliği: **YOK** — `src/app.module.ts`, `package.json`, `src/database/data-source.ts` dokunulmadı.
- Şema değişikliği: **YOK** → `migration 1840*` üretilmedi. Fresh PostgreSQL kanıtı şema için gerekmez; DB'ye bağlı
  suite'ler için CI (DB Smoke) yine zorunludur (yerelde PostgreSQL kapalı).
- Claim: protected endpoint erişimi **default-deny**; bağlam (user/tenant/branch/aktif rol/efektif izin) **tamamı sunucudan**
  çözülür; istemcinin gönderdiği tenant/şube/rol/izin değerleri **yetki üretmez**; hata yanıtları non-enumerating.
- Classification: **internal** (hedef `runtime`). PR açılmadığı için CI run URL'i **henüz yok**; `runtime` beyanı
  CI kanıtı bağlanmadan yapılmaz.

## §8 kanıt seti (7 satır)

| # | Kanıt | Sonuç |
|---|---|---|
| 1 | Yerel tip + test | `npx tsc -p tsconfig.json --noEmit` → **exit 0, stdout boş**. `npx jest --runInBand src test/rbac test/kvkk test/database test/contracts` → **Test Suites: 8 skipped, 100 passed (100/108) · Tests: 32 skipped, 853 passed (885 total) · 42.9 s** |
| 2 | DB (CI) | **Bekliyor**: yerel PostgreSQL kapalı → `test/database` suite'leri skip (8 suite / 32 test). **Yerel skip, CI kanıtı** PR açılıp DB Smoke çalıştığında bağlanır |
| 3 | Kabul (CI) | **Bekliyor**: `P0 browser E2E and artifact evidence` run URL'i (PR açılmadı) |
| 4 | Mutasyon kontrolü | **PASS** — aşağıdaki bölüm: default-deny satırı kaldırıldı → 2 negatif test KIRMIZI → geri alındı → yeşil |
| 5 | Redaction | **PASS** — log/artefakt taraması: bulgu = 0 (aşağıda) |
| 6 | Rollback provası | **PASS (dosya düzeyi)** — guard varsayılanı geri alındığında süitler yeşile döndü; şema/DB etkisi yok |
| 7 | Verdict | **Bekliyor**: A7 `artifacts/verify/R4/verdict.md` |

### Yerel komut kanıtı (satır 1 detayı)

| Kapsam | Komut | Sonuç |
|---|---|---|
| Tip kapısı | `npx tsc -p tsconfig.json --noEmit` | exit **0**, `tsc.out` **boş** |
| Zorunlu test seti | `npx jest --runInBand src test/rbac test/kvkk test/database test/contracts` | **100/108 suite**, **853/885 test PASS**, 8 suite (test/database) **PostgreSQL yok → skip** |
| Regresyon deltası (rbac+kvkk+contracts) | `npx jest --runInBand test/rbac test/kvkk test/contracts` | Önce: **23 suite / 212 test PASS** → Sonra: **24 suite / 234 test PASS** (+1 suite: `test/rbac/security-context-default-deny.spec.ts`, +22 test) |

> Not: 8 skip'in tamamı `test/database/**` (PostgreSQL gerektirir). Yerelde `DATABASE_URL` yok; kabul için **DB Smoke
> run URL'i** zorunludur ve dilim PR'ı açıldıktan sonra bağlanacaktır. "Yerel skip = yeşil" sayılmadı.

## Mutasyon kontrolü (satır 4)

Korunan satır (`src/common/guards/permission.guard.ts`):

```ts
if (requiredPermission.length === 0 && !contextScoped) {
  // Beyan edilmemiş korumalı route → default-deny.
  return this.deny(request, 'undeclared_protected_route', requiredPermission);
}
```

Geçici mutasyon: `return this.deny(...)` → `return true;` (fail-open).

| Adım | Komut | Gözlenen |
|---|---|---|
| 1. Mutasyon uygula | — | default-deny fail-open |
| 2. Negatifleri koştur | `npx jest --runInBand src/common/guards/permission.guard.spec.ts test/rbac/controller-enforcement-consistency.spec.ts` | **KIRMIZI**: `Test Suites: 2 failed, 2 total` · `Tests: 2 failed, 34 passed` — `PermissionGuard › [default-deny] denies a protected route with no access declaration` ve `default-deny runtime contract › denies a metadata-less protected controller even with an authenticated user` |
| 3. Geri al | — | satır orijinal hâline döndü |
| 4. Tekrar koştur | aynı komut | **YEŞİL**: `Test Suites: 2 passed, 2 total` · `Tests: 36 passed` |

Sonuç: default-deny kaldırıldığında ilgili negatif testler kırmızıya döner → test gerçekten korumayı ölçüyor.

## Negatif matris (fail-closed kanıtı)

| # | Senaryo | Uygulama / yol | Beklenen | Gözlenen | Test yolu |
|---|---|---|---|---|---|
| N1 | Bağlam yok (anonymous) + metadata'sız protected controller | `PermissionGuard` (fake ExecutionContext) | erişim YOK (KIRMIZI) | PASS — `false` | `test/rbac/controller-enforcement-consistency.spec.ts` › *denies a metadata-less protected controller when no context is resolved* |
| N2 | Kimliği doğrulanmış ama beyanı olmayan korumalı route | aynı | erişim YOK | PASS — `false` | aynı dosya › *denies a metadata-less protected controller even with an authenticated user*; `src/common/guards/permission.guard.spec.ts` › *[default-deny] denies a protected route with no access declaration* |
| N3 | Cross-tenant: `x-tenant-id` ≠ token tenant | guard | erişim YOK + `authorization.denied` (`tenant_header_mismatch`) | PASS — `false` + audit çağrısı | `permission.guard.spec.ts` › *rejects a client-supplied tenant header…*; enforcement spec › *denies a cross-tenant header…* |
| N4 | Client şube seçimi (`x-branch-id`) sunucu kapsamı dışında | `BranchScopeService.resolveSelection` + guard | erişim YOK / 404 | PASS — `AuthorizationContextError('unauthorized_branch')` → `false`; controller'da 404 | `src/rbac/security-context-services.spec.ts`, enforcement spec › *denies a client-supplied branch…*, `test/rbac/security-context-default-deny.spec.ts` |
| N5 | Client beyanı: gövde/başlıkta `tenantId`/`roles`/`permissions` | DTO + global `ValidationPipe(forbidNonWhitelisted)`; guard | 400 / yetki YOK | PASS — `BadRequestException`; guard senkron yetki kaynağı olarak yalnız sunucu verisini kullanır | `security-context-default-deny.spec.ts` › *rejects tenant/branch/role/permission claims…*; enforcement spec › *client-supplied tenant, role and permission values never grant access* |
| N6 | Escalation: istemcinin iddia ettiği aktif rol sunucuda yok | `buildAuthorizedContext` | bağlam RED | PASS — `AuthorizationContextError('inconsistent_active_role')` | `src/common/context/security-context.spec.ts` › *rejects a client-claimed active role…* |
| N7 | Eksik izin (sunucu-çözümlü yetki) | guard | 403 + generic mesaj | PASS — `false` + `missing_permission` audit | `permission.guard.spec.ts` › *denies missing route permission…* |
| N8 | Başka tenant/şube kaydı ya da var olmayan kayıt | `deny-response` | ayrım YOK (tek 404) | PASS — `indistinguishableDenials(...) === true`, mesaj `Kayıt bulunamadı` | `security-context.spec.ts` › *maps cross-tenant, cross-branch and unknown resources to the same 404*; `security-context-default-deny.spec.ts` › *does not distinguish cross-tenant from cross-branch…* |
| N9 | Bayat `token_version` (yetki iptali) | `AuthorityResolverService.resolve` | yetki RED + önbellek temizliği | PASS — `stale_authorization_version`; önbellek girdisi silinir | `security-context-services.spec.ts` › *fails closed on a stale token version* |
| N10 | Rol/izin mutasyonu sonrası bayat önbellek | `invalidateUser`/`invalidateTenant` | sonraki çözümleme taze (miss) | PASS — `cache: 'miss'`, sorgu tekrar çalışır | `security-context-services.spec.ts` › *never serves a stale authority after invalidation* / *invalidates every tenant entry…* |
| N11 | Tenant izolasyonu (şube + kurum sorguları) | `BranchScopeService`, `ContextCatalogService` | yalnız aktif tenant kapsamı | PASS — sorgu parametreleri `[tenantId]`/`[tenantId, userId]`; SQL `tenant_id = $1` | `security-context-services.spec.ts` › *grants every active branch of the tenant…* / *fails closed when the institution is missing…* |
| N12 | Katalog jargon/UUID sızıntısı | `ContextCatalogService` | iç UUID/ETag/izin kodu YOK | PASS — serileştirilmiş yanıtta UUID/`etag|tenantId|branchId|permission` deseni yok | `security-context-services.spec.ts` › *returns human-readable institution and branch names only* |
| N13 | Audit metadata allowlist + redaksiyon | `context-audit.ts` | allowlist dışı alanlar atılır, secret maskelenir | PASS — yalnız allowlist anahtarları; e-posta/bearer `[redacted]` | `security-context.spec.ts` › *drops every non-allowlisted field…* / *redacts secret-looking values…* |
| N14 | Runtime ↔ statik public allowlist sapması | `public-route.ts` + statik tarama | tam eşitlik (bayat girdi yok) | PASS — `PUBLIC_ROUTE_KEYS` = `PUBLIC_ROUTES` | enforcement spec › *keeps the runtime public allowlist in sync…* |
| N15 | Beyanı olmayan yeni route eklenirse | statik tarama (`collectFindings`) | KIRMIZI (default-deny ihlali) | PASS — `@Permissions` ya da allowlist'li `@ContextScoped` yoksa bulgu üretir | enforcement spec › *covers every protected route with… (default-deny violation)* |

## AC eşlemesi (R4 brif)

| AC | Durum | Kanıt |
|---|---|---|
| (a) context yokken protected controller fail-closed | **PASS (yerel)** | N1/N2 + mutasyon kontrolü; `PermissionGuard` artık metadata'sız route'ları da kimlik doğrulamaya sokar |
| (b) client tenant/branch/rol değerleri yetki veremez | **PASS (yerel)** | N3/N4/N5/N6; yetki kaynağı `AuthorityResolverService` (DB) ya da kimlik katmanının sunucu-çözümlü `request.user`'ı |
| (c) cross-tenant/branch/escalation/missing-permission negatifleri | **PASS (yerel)** | N3–N8, N11 |
| (d) catalog yalnız erişilebilir kayıtları okunabilir adlarla döner | **PASS (yerel)** | N12 + `src/rbac/context-catalog.controller.ts` (`@ContextScoped`, `/context`, `/context/branch`) |
| (e) mevcut regresyonlar (rbac/kvkk/database) yeşil | **PASS** | 100/108 suite yeşil; `test/database` 8 suite **PostgreSQL yok → skip** (CI kanıtı bekliyor) |
| (f) şema değiştiyse fresh PostgreSQL kanıtı | **N/A / tetiklenmedi** | Şema değişmedi (migration yok); DB'ye bağlı suite'ler için CI DB Smoke kanıtı yine zorunlu |


## Redaction beyanı (satır 5)

| Kontrol | Komut / yol | Sonuç |
|---|---|---|
| Üretim kodu + artefakt taraması (JWT/bearer/e-posta/telefon deseni) | 12 dosya (`src/common/context`, `src/common/guards`, `src/rbac` non-spec + `artifacts/R4/evidence.md`) | **bulgu = 0** |
| Test fixture'ları | `src/common/context/security-context.spec.ts:173–176` | 3 satır `example.com` / `Bearer abc.def.ghi` — **sentetik redaksiyon fixture'ı**; test bunların maskelendiğini (`[redacted]`) ve gövde alanının atıldığını doğrular. Gerçek PII/secret yok |
| Mojibake taraması (repo-operations §2) | 19 dosya, `Ã|Ä|Å|â€` | **bulgu = 0** |
| Audit metadata allowlist | `src/common/context/context-audit.ts` | Audit olayı yalnız `CONTEXT_AUDIT_METADATA_ALLOWLIST` alanlarını taşır; `body`/`headers`/`authorization`/`cookie`/`token`/`email`/`phone`/`fullName` gibi alanlar **atılır**, allowlist içi hassas görünümlü değerler `[redacted]` |
| Log taraması (test koşuları) | `jest` stdout/stderr | Yeni kod yalnız `security.context.denied` olayını (allowlist alanlı) ve sayısal özetleri yazar; ham istek gövdesi/başlığı yazılmaz |

> Katalog yanıtı (`/api/v1/context`) iç UUID, ETag, optimistic-lock anahtarı veya izin kodu döndürmez; yalnız
> kurum/şube **adları** ve rol **etiketi** döner (N12 testiyle serileştirme düzeyinde doğrulanır).

## Rollback

1. **Kod geri alma (önerilen):** `git revert <R4-sha>` — dilim yalnız `src/common/context/**`, `src/common/guards/**`,
   `src/rbac/**` ve `test/rbac/**` dosyalarını değiştirir; **şema/migration yok**, veri dönüşümü yok.
2. **Guard varsayılanını geçici opt-in'e alma (kısa süreli acil durum):** `PermissionGuard` içindeki
   `if (requiredPermission.length === 0 && !contextScoped)` bloğu `return true;` yapacak şekilde geçici olarak
   devre dışı bırakılır → sistem önceki (fail-open) davranışa döner. **Prova edildi**: bu değişiklik uygulandığında
   ilgili 2 negatif test kırmızıya döndü, geri alındığında 36/36 test yeşile döndü (bkz. mutasyon kontrolü).
   Bu yol yalnız kısa süreli acil müdahale içindir; kalıcı hâle getirilmesi güvenlik regresyonudur.
3. **Katalog endpoint'ini kapatma:** `ContextCatalogController` `src/rbac/rbac.module.ts` içindeki `controllers`
   listesinden çıkarılır (tek satır); route'lar 404 döner, diğer dilimler etkilenmez.
4. **Önbellek kapatma (davranış provası):** `AUTHORITY_CACHE_TTL_MS=0` → her istekte taze DB çözümlemesi
   (önbellek kaynaklı bayatlık şüphesinde anında mitigasyon; testli).

## Açık boşluklar / residual'lar (dürüst beyan)

1. **CI kanıtı bekliyor:** PR talimat gereği **açılmadı** (A7 GO + ORCH onayı bekleniyor) → §8 satır 2 ve 3 (DB Smoke,
   P0 browser E2E) için run URL'i **yok**. Bu nedenle sınıflandırma **`internal`**; `runtime` beyanı CI URL'i
   bağlanmadan yapılmaz. Yerelde 8 `test/database` suite'i PostgreSQL kapalı olduğu için **skip**.
2. **Dilim boyutu hedefin üstünde:** toplam **+2.422/−60** (20 dosya). Kırılım: üretim kodu **1.331 satır**
   (hedefin altında), test/spec **1.003 satır**, doküman/artefakt 88 satır. Test payı yüksek çünkü brifin 7 kapsam
   maddesinin 6'sı test kanıtı zorunlu kılıyor, 7. madde **zaten** mevcut test dosyasının genişletilmesi
   (`test/rbac/controller-enforcement-consistency.spec.ts` +272) ve negatif matris + mutasyon kontrolü ayrı
   kanıt gerektiriyor. **ORCH kararı gerekirse bölme önerisi:** `/api/v1/context` katalog uç noktası
   (`context-catalog.*`, `context-scope.decorator.ts`, DTO + ilgili testler ≈ 530 satır) ayrı bir dilime
   (R4b) taşınabilir; default-deny + yetki çözümleme çekirdeği bu dilimde kalır.
3. **Kimlik doğrulama katmanı ikinci çözümleme:** `src/auth/**` bu dilimin sahipliği dışında olduğu için JWT
   doğrulaması hâlâ kendi yetki çözümlemesini yapar; guard ek olarak `AuthorityResolverService` (önbellekli)
   üzerinden **bağımsız** doğrular. Tek sorguya indirmek `src/auth/**` değişikliği gerektirir → ORCH kararı.
4. **Şube kapsamı politikası:** gözetim rolleri (`tenant_admin`, `operations_manager`) veya `tenant:branch:read`
   izni olan aktör tenant'ın tüm aktif şubelerini görür; bağlı öğretmen `teacher_branches` (aktif dönem) üzerinden
   görür; diğer aktörler **boş küme** (fail-closed). Öğrenci/veli için şube kapsamı bu dilimde tanımlanmadı.
5. **Guard senkron yolu:** `AuthorityResolverService` enjekte edilmediği dar durumda (izole birim spec'leri,
   mevcut `course/room/time-slot` controller spec'leri bu kurucu imzasını kullanıyor) yetki, kimlik katmanının
   sunucu-çözümlü `request.user`'ından alınır ve karar senkron döner. Runtime DI grafiğinde çözümleyici **daima**
   enjekte edilir (RbacModule export). Bu yolu kaldırmak, sahipliğim dışındaki 3 spec dosyasında değişiklik
   gerektirir → ORCH kararı.
6. **İnsan kapıları:** H1–H7 bu dilimde **"yapıldı" sayılmaz**; R4 için ilgili olan tek kapı H3 (review+merge)
   olup PR açılışına bağlıdır.

