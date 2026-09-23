# A4-F1 — Kabul harness genişletmesi (R10/R11 ön işi) · KANIT

| Alan | Değer |
|---|---|
| Dilim | **A4-F1** (§10.4 F1 ön işi; R10/R11 altyapısı) |
| Issue | **#269** (ACCEPTANCE fresh-DB UI journey) |
| Branch | `p1b/acceptance-harness-f1` |
| Baz | `origin/main` @ `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae` |
| Sahiplik | `test/e2e/**`, `test/acceptance-guard/**`, `.github/workflows/wp07f-*.yml` (ürün kodu `src/**` **değişmedi**) |
| Tarih | 2026-09-23 |

> Bu dilim **hiçbir journey adımını PASS ilan etmez**. Kanıtladığı şey: harness'ın
> sözleşmesi, fail-closed verdict politikası, negatif matris kataloğu, artefakt
> head-SHA bağı ve bu kuralların *gerçekten kırmızıya döndüğü*.

---

## 1. Kapsam / kapsam dışı

**Kapsam (F1):**

1. **Journey iskeleti** (7 adım: schedule publish → leave request → approval →
   impact → candidate assign/clear → attendance lock → notification draft).
   API'si olmayan adımlar `SKIP` değil **`NOT_IMPLEMENTED` → non-PASS** raporlanır;
   hangi dilimin açacağı `pendingSlices` alanında yazılıdır. `SKIP` diye bir
   verdict **yoktur** (`verdict-policy`).
2. **Referans-fixture genişletmesi**: ikinci şube, aday öğretmen
   (+`teacher_courses`/`teacher_branches`), roster öğrencileri, veli (iletişim
   alanları **boş**), `tenant_settings`, `teacher_courses`. **İş sonucu tablosuna
   SQL yazımı yok**; `jobOutcomeRowsCreated = 0` invariant'ı yeni tablolarla
   genişletildi (`schedules`, `schedule_versions`, `daily_operation_lessons`,
   `report_runs`, `kvkk_*`). Seeder yalnız `REFERENCE_TABLES`'a yazar ve
   seeder'ın gerçekten dokunduğu tablolar (`fixture.seededTables`) raporda
   kanıtlanır.
3. **Negatif matris iskeleti**: `unauthorized`, `forbidden`, `cross-tenant`,
   `stale` (If-Match), `session-expiry`, `expired`, `offline`, `invalid-input`.
   Kural: **`env unreachable` / 404 / `skip` / `neutral` / `cancelled` PASS
   değildir** (`classifyNegativeOutcome`, fail-closed).
4. **Artefakt sözleşmesi**: trace/video/screenshot/log/DB-audit kanıtı **exact
   head SHA**'ya bağlı (`artifact-manifest.json`, `acceptance-artifact-manifest/v1`)
   + PII/secret redaksiyon taraması **bulgu = 0**; CI adımı head bağını ve yasak
   verdict etiketlerini denetler.
5. **Guard genişletmesi**: mevcut kurallar **gevşetilmedi**; yeni fail-closed
   kurallar eklendi (R6, R7, R8, R10, R13, R14) ve her yeni kural için ihlal
   örneği + **kırmızı kanıt** üretildi (bkz. §3, §4).

**Kapsam dışı:** ürün kodu (`src/**`) — bulgu varsa diff önerisi olarak raporlanır;
R10'un gerçek adım executor'ları (dilimler merge oldukça açılır); trace/video
artefakt üretimi (R11); canary/rollback provası (R11); `docs/**` (A6).

---

## 2. §8 kanıt seti (7 satır)

| # | Kanıt | Sonuç (çalıştırılan komut → gözlem) |
|---|---|---|
| 1 | **Yerel tip + test** | `npx tsc -p tsconfig.json --noEmit` → **exit 0, stdout boş, stderr boş**. E2E tip kontrolü (geçici tsconfig, **commit edilmedi**): `npx tsc -p tsconfig.e2e-typecheck.tmp.json` → **exit 0, stdout boş, stderr boş**. `npm run test:e2e:guard` → **25/25 PASS**. |
| 2 | **DB (CI)** | Yerelde PostgreSQL kapalı: `npm run test:e2e` → **exit 1**, `Test Suites: 2 failed / Tests: 15 failed`, hepsi `E2eEnvironmentError: DATABASE_URL is required…` → **yerel skip DEĞİL, fail-closed**. Gerçek DB kanıtı CI'dadır (P0 iş akışı `postgres:16` service + `db:migrate` + `db:seed:permissions`). |
| 3 | **Kabul (CI)** | `P0 browser E2E and artifact evidence` — **yerel skip, CI kanıtı**. Beklenen: guard (25) yeşil + `runtime-shell-auth` 8/8 PASS + `journey-skeleton` iskelet yeşil (journey verdict'i `NOT_IMPLEMENTED`, yani kabul iddiası **yok**). Run URL'i PR açıldıktan sonra bu dosyaya eklenir (PR yalnız A7 GO + ORCH onayıyla açılır). |
| 4 | **Mutasyon kontrolü** | 2 tur (bkz. §4): Mutation A → **2 test kırmızı**, Mutation B → **4 test kırmızı**; ikisi de geri alındı → **25/25 PASS**. |
| 5 | **Redaction** | `writeArtifactManifest` içindeki redaksiyon taraması **findingCount = 0** (her iki yüzey: shell + journey); spec içinde `scanArtifactDirectory(...).findingCount === 0` ve `verifyArtifactManifest(...) === []` **assert edilir** (uyarı değil, kırmızıya döner). `scanTextForLeaks` 4 yeni desen kazandı: credential'lı bağlantı dizesi, private key bloğu, sağlayıcı jetonu, secret env ataması. |
| 6 | **Rollback provası** | `git revert <A4-F1 squash-sha>` (veya branch silme). Ürün kodu ve migration **değişmedi** → üretim davranışı etkilenmez; check seti eski hâline döner. Workflow adımı yalnız doğrulayıcıdır (`if: always()`), iş akışını kısaltmaz. |
| 7 | **Verdict** | A7 → `artifacts/verify/A4-F1/verdict.md` (GO/NO-GO). Bu dilimde **bekliyor**. |

---

## 3. Guard kural ledger'ı (gevşetme yok)

| Kural | Durum | Not |
|---|---|---|
| R1 iş sonucu SQL yazımı | **değişmedi** (kapsam genişledi: 15 tablo) | Yeni tablolar eklendi, hiçbiri çıkarılmadı. |
| R2 harness yalnız referans tabloya yazar | **değişmedi** | Test sentinel'i güncellendi (`tenant_settings` artık *referans* olduğu için `audit_logs` kullanılıyor). |
| R3 `page.evaluate` ağ isteği | **değişmedi** | — |
| R4 `page.evaluate` DOM yazımı | **değişmedi** | — |
| P1 legacy işaret suistimali | **değişmedi** | — |
| R6 `skip`/`todo`/`only` yasağı | yeni (F1) | Kabul yüzeylerinde; DB suite'lerindeki meşru "env yoksa skip" kapsam dışı. |
| R7 yasak verdict literali | yeni (F1) | `verdict/outcome/result = 'SKIP'/'neutral'/…` atanamaz. |
| R8 doğrudan işlemsel API çağrısı | yeni (F1) | İzin listesi yalnız `/api/v1/health` (gerekçe zorunlu, >40 karakter; bayat/boş gerekçe reddedilir). |
| R9 artefakt manifest/head bağı | yeni (F1) | + "manifesto gerçekten harness ve CI akışına bağlı" testi. |
| R10 kanonik liste kopyası | yeni (F1) — **kalibre edildi** | Aşağıya bakınız. |
| **R13** kabul yüzeyinde iş sonucu tablosu literali | **yeni (F1)** | Literal yasak; sözleşmeden import zorunlu. |
| **R14** kabul yüzeyinde sabit commit SHA | **yeni (F1)** | Kanıt koşunun gerçek head'ine bağlanmalı. |
| R11 negatif sınıflandırma | yeni (F1) | `unreachable/404/skip/neutral/cancelled` PASS'a dönüşemez. |

### R10 kalibrasyonu (şeffaf kayıt)

R10 ilk hâlinde *herhangi* bir ifadede ≥2 iş sonucu tablosu literalini ihlal
sayıyordu; bu, **3 yanlış pozitif** üretti:

1. `test/e2e/support/journey-contract.ts` (adım başına beklenen tablolar),
2. `test/e2e/support/journey-contract.ts` (ikinci adım grubu),
3. `test/rbac/tenant-repository-scope.spec.ts` (`kvkk_*` tabloları) — **A4
   sahipliği dışında**, yani düzeltilemez; kural bu dosyayı repo genelinde
   kırmızıya çeviriyordu.

Düzeltme iki parçalı ve **net güç kaybı yok**:

- (a) Journey sözleşmesi artık tablo listesini **taşımaz**; adım→tablo eşlemesi
  `acceptance-tables.JOURNEY_OUTCOME_TABLES` (tek doğruluk kaynağı) içinden
  gelir ve `assertJourneyOutcomeMembership` her girdinin `JOB_OUTCOME_TABLES`
  içinde olduğunu **fail-closed** doğrular (import anında fırlatır).
- (b) R10 yalnız **kanonik listenin adını taşıyan** bağlamaları arar
  (`JOB_OUTCOME…TABLES` / `EVIDENCE_TABLES` / `OUTCOME_TABLES`); yani "ikinci
  kopya" ihlali hedeflenir, domain kodunun meşru tablo grupları değil.
- (c) Kabul yüzeyleri için **daha güçlü** bir kural eklendi: **R13** — literal
  tablo adı tamamen yasak, import zorunlu. Yani kabul yüzeylerinde kapsam
  daralmadı, **genişledi**.

Kanıt: Mutation B (anchor `/./`'e gevşetildi) → repo-temizliği canary'si + R10
testi **kırmızı** (bkz. §4).

---

## 4. Mutasyon kontrolü (kırmızı kanıt)

**Mutation A — yeni R13 + R14 kural blokları devre dışı:**

```
Tests: 2 failed, 23 passed, 25 total
  ✕ R13 — kabul yüzeyinde iş sonucu tablosu adı literal olamaz (import zorunlu)
  ✕ R14 — kabul yüzeyinde sabit commit SHA bulunamaz
```

**Mutation B — üç kural aynı anda zayıflatıldı:**

| Mutasyon | Kırılan test |
|---|---|
| R10 anchor `JOB_OUTCOME…TABLES` → `/./` | `depoda istisnasız kabul ihlali bırakmaz` (canary) + `R10 — iş sonucu tablo listesi kopyalanamaz` |
| `verifyArtifactManifest` beklenen-head karşılaştırması kaldırıldı | `R9 — artefakt manifestosu exact head SHA'ya bağlanır ve kurcalanınca FAIL verir` |
| `assertPassProvenance` yürütücüsüz-PASS kontrolü kaldırıldı | `F1 — PASS uydurulamaz: kanıtsız PASS FAIL'e düşer…` |

```
Tests: 4 failed, 21 passed, 25 total
```

**Geri alma:** üç mutasyon da birebir geri alındı; son koşu
`Tests: 25 passed, 25 total` (bkz. §2 satır 1). Diskte mutasyon artığı yok
(`MUTASYON|MUTATION|false &&` taraması → 0 bulgu).


---

## 5. Artefakt sözleşmesi (ne üretiliyor)

| Artefakt | Üretici | Bağ |
|---|---|---|
| `artifacts/wp07f-p0-browser-e2e/report.json` | `runtime-shell-auth.e2e-spec.ts` | `headSha = env.headSha` |
| `…/artifact-manifest.json` | aynı spec (`writeArtifactManifest`) | exact head + redaction=0 + kapsam |
| `…/journey/journey-report.json` | `journey-skeleton.e2e-spec.ts` | adım/senaryo verdict'leri + `jobOutcomeRowsCreated` |
| `…/journey/artifact-manifest.json` | aynı spec | exact head + redaction=0 + rol listesi (trace/video → `pending-slice` + gerekçe) |
| `…/screenshots/*.png` | her iki spec | kimlik alanları gerçek klavye etkileşimiyle temizlendikten sonra çekilir |

CI adımı (`Verify acceptance artifacts are bound to the exact head SHA`) her iki
manifestoyu `PULL_REQUEST_HEAD_SHA` ile karşılaştırır, `redaction.findingCount`
= 0 arar, kapsamdaki dosyaların diskte olduğunu doğrular ve raporlarda yasak
verdict etiketi (`"SKIP"`, `"SKIPPED"`, `"NEUTRAL"`, `"CANCELLED"`, `"PENDING"`,
`"UNKNOWN"`) bulunursa **exit 1** verir.

---

## 6. Bilinen boşluklar / residual (dürüst liste)

1. **Journey adımları uygulanmadı**: `F1_JOURNEY_EXECUTORS = {}` → 7/7 adım
   `NOT_IMPLEMENTED` (non-PASS). Executor'lar R10 diliminde eklenir; adım
   sözleşmesi ve verdict kuralları değişmez.
2. **Negatif matris executor'ları yok**: 8 senaryonun tamamı `NOT_IMPLEMENTED`;
   her biri için beklenen durum ve açacak dilim yazılıdır.
3. **Trace/video artefaktı** `pending-slice` (R11) — gerekçesi manifestoda.
4. **CI run URL'i yok**: PR yalnız A7 GO + ORCH onayıyla açılır; run URL'i ve
   gerçek DB/tarayıcı kanıtı PR sonrası eklenir.
5. **Kapsam boyutu**: bu dilim ~**2.774 satır** (1.277 tracked diff + 1.497 yeni
   dosya) → plan hedefi (~1.500) **üstünde**. Bu dosya kümesi ORCH snapshot'ında
   devralındı (önceki run'ın commit'siz F1 işi); ürün kodu içermez.
   Bölme gerekirse öneri: **F1a** = iskelet + guard kuralları (journey-contract,
   journey-runner, verdict-policy, negative-matrix, guard spec) · **F1b** =
   fixture genişletmesi + artefakt manifest + workflow head-SHA adımı.
   Karar ORCH/A7'ye aittir; gizlenmemesi için buraya yazıldı.
6. **`kvkk_*`, `report_runs`, `daily_operation_lessons`** artık iş sonucu
   tablosudur → R1 kapsamındadır; bu tabloların *runtime* üretimi ilgili modül
   dilimlerinin işidir (bu dilim yalnız sözleşmeyi genişletir).
7. **`tenant_settings`/`students`/`guardians` referans tablo** sayılır ve
   seeder tarafından yazılır: bunlar "kim/nerede" sorusunu tanımlar, iş sonucu
   değildir.
8. **Leak scanner'ın hex/UUID metni üzerinde yanlış-pozitif olasılığı**
   (pre-existing; F1'de maruziyet arttı): `scanTextForLeaks` telefon deseni
   `5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}` (10 hane) rastgele hex
   dizilerinde eşleşebilir. 40 karakterlik bir commit SHA için kaba olasılık
   ≈ %2/koşu (31 başlangıç konumu × (1/16)·(10/16)⁹ ≈ 0,022). Bu risk #353'ten
   beri vardır (`report.json` zaten `headSha` taşıyor) ve CI'da materyalize
   olmamıştır; F1 journey artefaktı ve shell-auth'un artık journey alt ağacını da
   taraması maruziyeti bir miktar artırır. PII kuralını gevşetmemek için
   **scanner DEĞİŞTİRİLMEDİ**; önerilen düzeltme (A7/ORCH kararı): PII
   desenlerinden önce 40-hex commit SHA ve UUID biçimlerini nötrle (kişi verisi
   değillerdir), gerçek telefon/e-posta desenleri aynen kalsın. Bu bir
   yanlış-yeşil değil, olası yanlış-kırmızı kaynağıdır ve gizlenmemesi için
   buraya yazılmıştır.

---

## 7. Tekrar üretim (komutlar)

```powershell
# tip kapısı (ürün kodu)
npx tsc -p tsconfig.json --noEmit            # exit 0, stdout boş

# E2E tip kapısı (geçici tsconfig; COMMIT EDİLMEZ)
npx tsc -p tsconfig.e2e-typecheck.tmp.json   # exit 0, stdout boş

# statik guard (fail-closed, 25 test)
npm run test:e2e:guard                       # 25 passed

# gerçek harness (fresh DB + src/main.ts + gerçek tarayıcı)
npm run test:e2e                             # yerelde DATABASE_URL yok → exit 1 (skip değil)
```

---

## 8. İnsan kapıları

| Kapı | Durum |
|---|---|
| H1 (prod secret + `/api/v1/health` 200) | **bekliyor** (insan) — bu dilim yalnız `JWT_*` varlık kontrolünü fail-closed yapar |
| H2 (Vercel preview/waiver) | kapsam dışı |
| H3 (PR review + merge) | **bekliyor** — PR yalnız A7 GO + ORCH onayıyla açılır |
| H4–H7 | kapsam dışı |

