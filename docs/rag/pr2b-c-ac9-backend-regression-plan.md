# WP-07F — PR-2B-C AC9 Backend Regression Plan (Backend & Data)

> PROMPT 3 (Backend & Data) çıktısı — #185 Acceptance Matrix §2.5 (AC9: `PENDING`)
> için backend regression planning kaydı.
> **Planning only: kod yazma YOK, PR açma YOK, workflow trigger YOK.**
> Execution (implementation, PR, check trigger) ayrı yetkilendirme ister.

## Karar

- **GO** (planning) — regression suite tasarımı onaylıdır.
- Execution **BLOCKED**: kod yazımı, PR açma, workflow trigger ayrı yetki ister
  (PR-2b-A `PR2BA-*` kartlarındaki `requires_human_approval` kuralı ile aynı).

## Problem statement

## `#185` AC9 ("Tenant-local occurrence-date + multi-branch own-read regressions",
`docs/rag/185-acceptance-evidence-matrix.md` §2.5) için backend kanıtı eksiktir.
Mevcut kanıt unit bazlıdır (194/194 unit; `src/teachers/teacher-identity.service.spec.ts`
business-date fail-closed davranışını pinler), ancak aşağıdaki iki yüzey PostgreSQL
gerçek verisiyle regresyon olarak sınanmamıştır:

1. **Tenant-local occurrence-date:** `daily-operations.service.ts:13-26`
   (`parseQueueDate`) fallback zinciri `query.date → ctx.businessDate.date →
   DEFAULT_TENANT_TIME_ZONE` (Europe/Istanbul) taşır; `leave-identity.service.ts:29`
   ise `ctx.businessDate` yokken `isoDate(new Date())` (UTC) değerini `source:
   'tenant_local'` etiketiyle **sentezler** — `docs/wp-07/tenant-local-business-date-decision.md`
   ("GLOBAL_UTC_FALLBACK: REJECTED") kararıyla çelişen yüzey. Planlanan
  regression suite bu davranışı fail-closed kontratla pinleyecektir. Missing-
  `businessDate` için PASS kanıtı, `leave-identity.service.ts` UTC fallback'i
  kaldırılana veya route boundary context enrichment öncesi 403 verdiği
  kanıtlanana kadar yoktur; bu route testleri BLOCKED sayılır.
2. **Multi-branch own-leave read:** `leave.repository.ts:85-88` (`findOwn`) tenant +
   teacherId ile scoped'tır, branch filtresi içermez; identity katmanı ise
   `teacher-identity.service.ts:78-82`'de `memberships.length !== 1 → deny` yapar.
   Multi-branch öğretmen için own-read kontratı hiçbir yerde kesinleşmemiştir.

Ayrıca #185 AC9'un genel closure iddiası production exact-head observation'a (E14)
bağlıdır; bu plan **production observation bağımlılığını bilinçli olarak kapsam dışı
bırakır** — AC9 backend regression kanıtı tamamen PostgreSQL-backed suite ile
üretilir, #185 close-ready yorumu yine de E14 olmadan yazılmaz (no-close guardrail,
`docs/rag/pr2b-a-draft-package.md` §8).

## Regression cases

Tüm case'ler gerçek Nest servis/repository + PostgreSQL üzerinden koşulur; mock
repository ile PASS üretilmez. RequestContext `tenantId` + `businessDate
{tenantId, date, source:'tenant_local'}` taşır; client body/query/JWT hiçbir case'te
authority sayılmaz (tenant-local-business-date-decision.md guardrail'leri).

### tenant-local occurrence-date

- **Hedef kontrat:** Occurrence-date hiçbir koşulda global UTC gününden türetilmez.
  Authoritative tarih `ctx.businessDate.date (tenant_local)` değeridir.
  `query.date` yalnız opsiyonel filter olarak kalacaksa ISO calendar date
  doğrulamasından geçmeli; malformed/impossible values (`2026-99-99`,
  `2026-02-31`) 400 ile, `ctx.businessDate.date`/authority/context çelişkileri
  403 ile reddedilmelidir. Fallback yalnız `DEFAULT_TENANT_TIME_ZONE`
  `Intl.DateTimeFormat` çıktısı olabilir (`daily-operations.service.ts:13-19`).
- **Yüzeyler:**
  - `daily-operations.service.ts:33` — `today()`: `parseQueueDate(query.date,
    ctx.businessDate?.date)`.
  - `daily-operations.repository.ts:132-137` — `WHERE lesson.tenant_id = $1 AND
    lesson.branch_id = $2 AND lesson.occurrence_date = $3::date`.
  - `leave-impact.types.ts:246-288` — `zonedDateTimeToUtc` /
    `eventOccurrencesForRange` timeZone parametresiyle; `dateStringInTimeZone`
    tenant-local gün üretir.
  - `teacher-identity.service.ts:31-38` — fail-closed: businessDate yok /
    `source !== 'tenant_local'` / farklı tenant / impossible calendar date → deny.
- **Senaryolar:**
  - Tenant-A `businessDate=2026-09-01` verilir; `today()` ve
    `eventOccurrencesForRange` çıktısında occurrence-date `2026-09-01` kalır
    (UTC günü farklı olsa bile — ör. Türkiye saati 2026-09-01 00:30 iken UTC
    `2026-08-31 21:30`).
  - `query.date=2026-09-01` + matching `ctx.businessDate.date=2026-09-01` kabul;
    conflicting `query.date=2026-08-31` veya impossible date reddedilir.
  - UTC gece yarısı sınırı: `new Date('2026-08-31T21:30:00Z')` + Istanbul TZ →
    occurrence-date `2026-09-01`; UTC `slice(0,10)` uygulanırsa `2026-08-31`
    (kayma tespiti).
  - `businessDate` eksik / yanlış tenant / `source='global_utc'` → identity deny
    (403), DB sorgusuna hiç ulaşılmaz (`teacher-identity.service.ts:71-72`).
    Missing-`businessDate` case'i, current UTC fallback kaldırılmadan veya route
    boundary deny kanıtı eklenmeden PASS sayılamaz.
- **PASS kuralı:** occurrence-date her senaryoda tenant-local calendar günüdür;
  UTC kayması tespit eden hiçbir çıktı yoktur; conflicting/impossible
  `query.date` reddedilir; fail-closed path 403 ile döner.

### multi-branch own-leave read

- **Hedef kontrat:** Own-read fail-closed identity resolution sonrası çalışır.
  `teacher-identity.service.ts` 2+ aktif membership durumunu `findOwn` öncesi
  reddettiği için multi-active teacher branch-independent 200 kontratı yoktur.
  Tek aktif membership çözüldükten sonra `LeaveIdentityService` resolved
  `branchId` bilgisini korur ve `findOwn` yalnız `{id, tenantId, teacherId,
  branchId}` ile tenant/teacher/branch scoped çalışır (`leave.repository.ts:85-88`).
- **Yüzeyler:**
  - `leave.controller.ts:38-42` — `GET /leaves/me/:id` (`leave:own:read`),
    teacherId client'tan kabul edilmez (server-side identity;
    `docs/leaves/leave-runtime-contract.md` §Security and privacy).
  - `teacher-identity.service.ts:78-82` — `listActiveBranchMemberships` +
    `memberships.length !== 1 → deny`.
- **Senaryolar:**
  - Tek aktif üyeliği olan öğretmen: kendi tenant/teacher/branch scoped kaydını
    `GET /leaves/me/:id` ile okuyabilir; aynı teacher'a ait fakat farklı branch'teki
    leave kaydı 404 döner.
  - İki aktif üyeliği olan öğretmen: identity resolution kontratı pinlenir —
    unambiguous tek aktif üyelik → resolve; 2+ aktif üyelik → deny (fail-closed,
    `teacher-identity.service.ts:82`) ve `findOwn` çağrılmaz.
- **PASS kuralı:** Tek aktif membership own-read 200; başka branch kaydı 404;
  multi-membership belirsizliği 403 (deny), asla yanlış branch kaydı dönmez.

### cross-tenant negative

- **Hedef kontrat:** Cross-tenant ve nonexistent kayıt aynı `404 Leave request
  not found` döner (non-enumerating; `leave-runtime-contract.md:48`).
- **Yüzeyler:** `leave.repository.ts:80-88` (`findTenantScoped`, `findOwn` null →
  `LeaveNotFoundException`).
- **Senaryolar:**
  - Tenant-A context ile tenant-B'nin leave kaydının `id`'si `findOwn` ve
    `findTenantScoped`'ta null döner → 404.
  - Aynı senaryo `GET /leaves/me/:id` (own) ve `GET /leaves/:id` (ops) üzerinden
    doğrulanır; 403/404 karışımı yok — tek kararlı 404.
- **PASS kuralı:** İki tenant'ta da aynı 404 body; satır sızmaz; enumeration
  imkânı yok.

### branch-not-visible

- **Hedef kontrat:** Aktif tenant'a ait olmayan branch hiçbir endpoint'te
  enumerate edilemez.
- **Yüzeyler:**
  - `daily-operations.repository.ts:96` + `daily-operations.service.ts:80` —
    `assertBranchOwnership` → `BRANCH_NOT_VISIBLE` → `404 Daily Operations queue
    not found`.
  - `leave.repository.ts:126-136` — create path `assertBranchOwnership` →
    `LeaveNotFoundException` (404).
- **Senaryolar:**
  - Tenant-A context + tenant-B'ye ait `branchId` ile `today()` → 404, 0 satır.
  - Aynı `branchId` ile `POST /leaves/me` → 404, `leave_requests` tablosuna satır
    yazılmaz (transaction rollback).
  - Ops `list` (`leave.repository.ts:66-78`) aynı branch ile → boş sonuç.
- **PASS kuralı:** Cross-tenant branch erişiminde 404 + veri etkisi sıfır.

### own-read positive

- **Hedef kontrat:** Öğretmen kendi kaydını (kendi branch'i, aktif tenant) okur.
- **Senaryo:** `POST /leaves/me` → 201, ardından `GET /leaves/me/:id` → 200;
  dönen kayıt `tenantId` + `teacherId` eşleşir; `branchId` create'te verilen
  branch'tir (tenant'a ait, `assertBranchOwnership` geçer).
- **PASS kuralı:** 200 + satırın tenant/teacher kimliği context ile birebir.

### own-read negative

- **Hedef kontrat:** Başkasının kaydına own-read yok; cross-tenant aynı 404.
- **Senaryolar:**
  - Aynı tenant'ta başka öğretmenin kaydı: `findOwn` null → 404.
  - Farklı tenant'ta aynı `teacherId`'ye ait "benzer" kayıt → 404.
  - Ops kullanıcısının own path'i çağırması → 403 (permission
    `leave:own:read` yok; 185 matrix §2.1 ile uyumlu 403/404 kararlılığı).
- **PASS kuralı:** 404 (nonexistent/başka teacher), 403 (yetkisiz rol); 200 asla
  olmaz.

## Fixture policy

- **Synthetic:** Tüm fixture'lar deterministik UUID + sabit değerlerle üretilir
  (`00000000-0000-4000-8000-0000000000xx` ailesi; mevcut
  `teacher-identity.service.spec.ts` ve 185 matrix E2E fixture deseni).
- **PII-free:** Production PII kesinlikle yasaktır. Synthetic fixture'larda isim,
  telefon, free-text reason, health detayı, guidance verisi kullanılmaz; yalnız
  synthetic e-posta gerekiyorsa `@qa.invalid` domain'i kullanılabilir
  (`productionLikePiiFixture=false`).
- **PostgreSQL-backed:** `TEST_DATABASE_URL` (`.env.test.example`) üzerinden
  izole/disposable DB zorunludur. Backend CI ve DB Smoke PostgreSQL provision
  eder, connection preflight çalıştırır ve database suite skip edilirse job fail
  olur; AC9 evidence DB'siz PASS üretemez.
- **Production PII fixture: YASAK.** Gerçek tenant/öğrenci/veli verisi hiçbir
  şekilde suite'e girmez; seed yalnızca synthetic tenant/branch/teacher/schedule.

## Evidence model

### required tests

- `test/database/ac9-occurrence-date-regression.spec.ts` (yeni, DB-backed) —
  tenant-local occurrence-date + UTC-kayma + fail-closed senaryoları.
- `test/database/ac9-multibranch-own-read-regression.spec.ts` (yeni, DB-backed) —
  multi-branch own-read + cross-tenant negative + branch-not-visible +
  own-read positive/negative.
- Unit pin ekleri: `src/teachers/teacher-identity.service.spec.ts` (fail-closed
  zaten var — multi-membership deny case'i eklenir).
- Mevcut suite'ler yeşil kalmalı: `test:unit` (194/194), `test:database`,
  `test:tenant-guard`, `test:rbac`, `test:kvkk`, `test:runtime-integration`
  (30/30).
- Planlama kaydı olarak: PR açılışında `docs/rag/185-acceptance-evidence-matrix.md`
  §2.5 AC9 satırı `PENDING → evidence_ready` güncellenir (execution sonrası).

### required CI

- `backend-ci.yml` — unit + yeni spec'ler; PostgreSQL service + `TEST_DATABASE_URL`
  preflight + DB-backed suite skip guard ile.
- `db-smoke.yml` — `npm run qa:db` zinciri (migrations → tenant-guard →
  database-required → kvkk) PostgreSQL preflight ve zero-skipped DB assertion ile.
- `gate1.yml`, `sprint1-quality-gate.yml` — mevcut gate'ler.
- `sensitive-pattern-scanner.yml`, `gitguardian.yml` — fixture PII-free doğrulaması.
- Workflow trigger: **yok** (bu kayıttan tetiklenmez; PR açılışında otomatik
  çalışır).

### artifact/log expectations

- Jest çıktısı + CI run ID'leri `docs/rag/190-evidence-ledger.md`'ye işlenir
  (E-prefix, head SHA pin).
- Artifact/log allowlist fields: `occurrenceDate`, opaque `tenantId`,
  `teacherId`, `branchId`, `statusCode`, canonical error code, and
  `notFoundShapeDigest` for normalized 404 fields.
- Opaque identifiers must be stable keyed-HMAC pseudonyms, not raw database
  IDs. Format: `hmac-sha256:v1:<base64url-digest>`, where the digest is an
  HMAC-SHA-256 over the raw identifier using an environment-specific evidence
  pseudonymization key. Raw UUID/database identifiers are forbidden in
  artifacts and logs.
- `notFoundShapeDigest` contract: SHA-256 over UTF-8 JSON with deterministic
  lexicographic key ordering for the complete canonical 404 body:
  `{error, errorCode, message, resource, statusCode}`. `statusCode=404`,
  `errorCode` is the canonical application code, `message` is the public
  non-enumerating response message, `error` is the public HTTP error label, and
  `resource` is a non-PII enum such as `leave_request` or
  `daily_operations_queue`.
- Raw request/response bodies and request IDs remain excluded. Stack trace,
  secret/token/cookie/Authorization header, production PII, contact data,
  notification payload and free-text PII remain forbidden.
- Fixture logları PII regex ile doğrulanır (health no-PII spec deseni).

### security/KVKK expectations

- Synthetic fixture flag: `productionLikePiiFixture=false`,
  `piiArtifactLeakCount=0` (185 matrix §2.3 KVKK satırı).
- Audit/outbox payload'ları PII içermez (`leave-runtime-contract.md:51-52`;
  `test/kvkk/audit-redaction.spec.ts` korunur).
- Permission-bearing route'larda JWT auth + permission guard sırası korunur
  (`leave-runtime.contract.spec.ts` pin'i).
- Security/KVKK PASS kuralı: manuel audit raporu
  (`docs/security/pr2b-a-security-kvkk-review.md` deseni) execution sonrası.

## Dependencies

- **PR-2b-A:** GO (planning, `docs/rag/pr2b-a-*.md`) — routing authority matrix,
  fixture policy, tenant/branch regression baseline; bu planın üzerine bindiği
  kontrat. Execution gerektirmez.
- **PR-2b-B:** production exact-head observation (E14) — AC9 backend regression
  **PR-2b-B'den bağımsız** koşulur (no production observation dependency);
  #185 genel closure yine de E14'e bağlı kalır (`185-acceptance-evidence-matrix.md`
  §2.5, `190-evidence-ledger.md` C7→C8→C10). PR-2b-B planning kaydı henüz yok
  (Blocking gaps #4).
- **#185:** AC9 maddesi bu plan + suite ile kapanır; close-ready yorumu E14
  olmadan yazılmaz (no-close guardrail).
- **#145:** #185 close-ready'ye bağlı (`190-evidence-ledger.md` C12); bu plan #145
  kapsamına girmez.

## Implementation readiness

- **READY_AFTER_PLAN_APPROVAL** — suite tasarımı (case'ler, fixture policy,
  evidence model) bu plan onayıyla uygulanabilir durumdadır; kod yazımı, PR açma
  ve workflow trigger ayrı yetkilendirme gerektirir.
- NOT_READY koşulu: Blocking gaps #1 (UTC fallback) ve #2 (multi-branch identity
  kontratı) CTO kararları kod yazımı öncesi verilmedikçe implementation
  başlamaz.

## Blocking gaps

1. **UTC fallback çelişkisi:** `leave-identity.service.ts:29` — `ctx.businessDate`
   yokken `isoDate(new Date())` (UTC) değeri `source:'tenant_local'` ile sentezlenir;
   `docs/wp-07/tenant-local-business-date-decision.md` "GLOBAL_UTC_FALLBACK:
   REJECTED" kararıyla çelişir. Regression suite fail-closed davranışı pinler;
   fallback'in kaldırılması/üst akışta businessDate zorunluluğu ayrı bir fix PR
   ister (bu PR'da kod değişikliği yok).
2. **Multi-branch identity kontratı pin'li değil:** `teacher-identity.service.ts:82`
   `memberships.length !== 1 → deny`. Kod yazımı öncesi CTO kararı gerekir:
   unambiguous tek aktif üyelik → resolve; 2+ aktif üyelik → deny (fail-closed).
3. **PostgreSQL test DB:** Yerel ortamda `DATABASE_URL`/`TEST_DATABASE_URL` yoksa
   DB-backed spec'ler skip olur (`test/database/migrations.spec.ts:3-4`) — PASS
   taklidi riski. CI `db-smoke` + yerel test DB şart koşulur; skip durumu CI'da
   fail olarak değerlendirilir (tasarım kararı).
4. **PR-2b-B planning kaydı yok:** Bağımlılık adı sabittir; içeriği CTO synthesis
   öncesi netleşir. Bu plan PR-2b-B'yi beklemeden ilerleyebilir.
5. **#185 no-close guardrail:** Bu plan AC9 evidence üretir ama #185 close-ready
   E14 (production exact-head observation) olmadan YAZILMAZ.

## CTO recommendation

- **GO (planning).** AC9 backend regression suite PostgreSQL-backed, synthetic,
  PII-free olarak tasarlanmıştır; production observation bağımlılığı yoktur ve
  PR-2b-B ile paralel koşulabilir. `parseQueueDate`/`findOwn`/fail-closed identity
  yüzeyleri birebir kod referanslarıyla pin'lenmiştir.
- **Execution HOLD** — iki karar noktası kod yazımı öncesi CTO onayı ister:
  Blocking gaps #1 (UTC fallback) ve #2 (multi-branch kontratı). Bu iki karar
  verilmeden implementation başlatılmaz.
- İmplementation, PR açma ve workflow trigger ayrı yetkilendirmeye tabidir; bu
  kayıt yalnızca planning kanıtıdır.

<!-- PR-2B-C AC9 BACKEND REGRESSION PLAN: PLANNING ONLY / NO CODE / NO PR / NO WORKFLOW TRIGGER / NO OBSERVATION / NO CLOSE -->
