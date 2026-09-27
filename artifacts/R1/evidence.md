# Evidence — R1 (#263) leave onay + impact kapısı

- Baz main: `15c5ab8d44f21b3165cf50658fadbc42b4bd68ae` · Branch: `p1b/leave-decision-impact-gate` · Tarih: 2026-09-23
- Claim: `LeaveService.decide()` içindeki **koşulsuz** `IMPACT_ANALYSIS_NOT_READY` kapısı kaldırıldı. Onay artık
  etkilenen dersleri (yayınlanmış program + occurrence) ve aday öğretmenleri **sunucuda** hesaplar; karar + etki +
  açık projeksiyonlar + durable audit + outbox **tek PostgreSQL transaction'ında** yazılır. Karar yanıtı ham UUID
  yerine okunabilir adlar taşır; sıfır etki sessizce geçilmez.
- Classification hedefi: `runtime` — **A7 GO + CI run URL'i olmadan beyan edilmez** (PR brief gereği henüz açılmadı).

## 1. Yerel tip + test (§8 kanıt #1)

| # | Kanıt | Komut | Sonuç |
|---|---|---|---|
| 1a | Tip kapısı | `npx tsc -p tsconfig.json --noEmit` | **exit 0**, stdout **boş**, stderr boş |
| 1b | Tam jest koşusu (ts-jest spec tip kontrolü dahil, Backend CI `npm test` yolu) | `npx jest --runInBand` | **exit 0** — Test Suites: 9 skipped, **108 passed**, 108/117 · Tests: 37 skipped, **908 passed**, 945 total · 64.9 s |
| 1c | R1 hedef suite'leri | `npx jest --runInBand src/leaves src/daily-operations test/contracts test/acceptance-guard test/kvkk test/rbac test/database` | **exit 0** — Test Suites: 9 skipped, **40 passed**, 40/49 · Tests: 37 skipped, **301 passed**, 338 total |
| 1d | DB suite (yerel) | `npx jest --runInBand test/database` | `test/database` suite'leri yerelde **skip** (PostgreSQL kapalı); skip oranı 1b/1c'deki 9 skipped suite'tir — CI DB Smoke kanıtı §2'de |

> `tsc` `tsconfig.json`'da `**/*.spec.ts` ve `test/` dışarıda olduğu için spec'ler `jest` (ts-jest, `strict`) ile
> ayrıca derlenir; bu yüzden ikisi birlikte koşulmuştur (`docs/agents/repo-operations.md` §5). Tam koşuda
> kırmızı **suite yok**; 1c kapsamı R1'in dokunduğu tüm yüzey + guard/kvkk/rbac sözleşmeleridir.

## 2. DB kanıtı (CI) — §8 kanıt #2

- Durum: **BEKLİYOR**. Yerelde PostgreSQL yok; `test/database/leave-decision-transaction.spec.ts` yerelde `skip`.
- CI'da koşacak yol: `npm run qa:db` → `test:database:required` (skip yasak) → `test/database/leave-decision-transaction.spec.ts`.
- Run URL: **PR açılmadığı için üretilmedi** (brief: PR yalnız A7 GO + ORCH onayı sonrası açılır). PR açıldığında bu
  satıra `DB Smoke` run URL'i yazılmalıdır.

## 3. Kabul (CI) — §8 kanıt #3

- Durum: **BEKLİYOR** — `WP-07F P0 browser E2E and artifact evidence` run URL'i PR sonrası bağlanır (R1'in UI payı yok;
  bu check R1'de regresyon koruması olarak izlenir).

## 4. Mutasyon kontrolü — §8 kanıt #4

Korunması gereken satır geçici olarak kaldırıldı, hedef test kırmızıya döndü, satır geri alındı.

**Mutasyon 1 — etki/projeksiyon yazımı karar transaction'ından koparıldı**

- Kaldırılan satır: `src/leaves/leave.repository.ts` → `this.impact.prepareApprovalImpact(manager, ctx, existing)`
  yerine `this.impact.prepareApprovalImpact(this.dataSource.manager, ctx, existing)` (kararın `manager`'ı yerine
  transaction dışı bir `EntityManager`).
- Komut: `npx jest --runInBand src/leaves/leave.repository.spec.ts test/contracts/leave-decision-impact.contract.spec.ts`
- Gözlenen: **exit 1 — Test Suites: 2 failed / 2; Tests: 2 failed, 10 passed**
  - `LeaveRepository › decision transaction (#263 R1) › prepares the impact and writes audit plus outbox on the same manager`
    → `expect(impact.prepareApprovalImpact.mock.calls[0][0]).toBe(manager)` **FAIL** (`Received: undefined`) —
    etki/projeksiyon artık karar transaction'ının `EntityManager`'ı üzerinde değil.
  - `R1 leave decision impact contract (#263) › runs decision, impact, projections, audit and outbox in one transaction`
    → gövde sözleşmesi pini (`await this.impact.prepareApprovalImpact(manager, ctx, existing)`) **FAIL**.
- Geri alma: satır orijinaline döndürüldü (`git diff` içinde `dataSource.manager` yok) → sonraki koşu yeşil (§1c/§1b).

**Mutasyon 2 — outbox yazımı transaction dışına alındı**

- Kaldırılan satır: `await this.insertOutbox(manager, eventName, saved, impact)`
  yerine `await this.insertOutbox(this.dataSource.manager, eventName, saved, impact)`.
- Gözlenen: **exit 1 — Test Suites: 2 failed / 2; Tests: 3 failed, 9 passed**
  - `TypeError: Cannot read properties of undefined (reading 'query')` → outbox artık kararın `EntityManager`'ına
    yazılmıyor (transaction-scoped değil); aynı anda contract pini de kırmızı.
- Geri alma: satır orijinaline döndürüldü. CI'daki DB testi
  (`test/database/leave-decision-transaction.spec.ts` → "rolls back decision, projections, audit and outbox together")
  bu mutasyonun PostgreSQL'de kalıcı kısmi kayıt ürettiğini gösterir; yerelde PG olmadığı için burada yalnız
  birim/contract kırmızısı kanıtlanmıştır.

## 5. Redaction — §8 kanıt #5

Tarama hedefi: `artifacts/R1/evidence.md`, `artifacts/R1/pr-body.md` ve bu dilimde üretilen tüm koşu çıktıları
(`jest*.out`, `jest*.err`, `mut1.*`, `mut2.*`, `tsc.out`, `tsc.err`).

| Desen | Amaç | Bulgu |
|---|---|---|
| `eyJ[A-Za-z0-9_\-]{10,}` | JWT/access token | **0** |
| `(?i)bearer\s+...` | Authorization başlığı değeri | **0** |
| `(?i)(password\|secret\|api[_-]?key\|token)\s*[:=]\s*<değer>` | parola/secret ataması | **0** |
| `postgres(ql)?://<kullanıcı>:<parola>@` | kimlik gömülü DB URL'i | **0** |
| `AUDIT_HMAC_KEY\s*=\s*\S+` | audit imza anahtarı değeri | **0** |
| `-----BEGIN` | private key bloğu | **0** |
| `<e-posta>` (`.test` dışı) | gerçek iletişim verisi | **0** |

Ek olarak: log/artefaktlarda öğrenci/veli kimliği, sağlık notu, serbest metin gerekçe ve ham istek/yanıt gövdesi
içeren çıktı üretilmedi (R1 kod yolları bu alanları zaten taşımaz; audit/outbox PII testleri §4 ve
`test/database/leave-decision-transaction.spec.ts` içindedir). Bulgu sayısı: **0/7 desen**.

> Tarama çıktısındaki tek eşleşme bu tablodaki `-----BEGIN` deseninin **kendi metnidir** (desen dokümantasyonu);
> artefaktlarda gerçek anahtar/token bulgusu yoktur.



## 6. Rollback provası — §8 kanıt #6

Prova gerçekten koşuldu (varsayım değil):

1. Dilim commit'i: `c892607` (`feat(leaves): onay kararı gerçek etki analiziyle tek transaction'da`).
2. `git revert --no-edit c892607` → geri alma commit'i `0fb331e` (yeni dosyalar silinir, karantina satırı ve eski
   sözleşme testleri geri gelir).
3. Komut: `npx jest --runInBand src/leaves src/daily-operations test/contracts`
   → **exit 0 — Test Suites: 12 passed / 12 · Tests: 110 passed / 110**. Yani geri alma sonrası ağaç kendi içinde
   tutarlı ve yeşil (dilim tek parça hâlinde geri alınabilir).
4. Değişiklik geri uygulandı: `git reset --hard c892607` → HEAD = `c892607` (prova commit'i bırakılmadı).
5. Şema/migration değişikliği olmadığı için veri geri alma adımı yok; yalnız kod geri alınır.

> Prova, dilim içeriğiyle **birebir aynı** ağaçta yapıldı (`c892607`). Bu kanıt satırları yazıldıktan sonra commit
> `--amend` edildi; teslim edilen HEAD `9bd1945` yalnız `artifacts/R1/**` metninde farklıdır (yürütülebilir ağaç
> değişmedi).


> Not: acil durumda tek satırlık daha dar geri dönüş de mümkündür (karar çağrısından önce
> `LeaveImpactAnalysisNotReadyException` fırlatmak) — bu, eski karantina davranışını döndürür ve karantina pinini
> geri getirmeyi gerektirir (bkz. `artifacts/R1/pr-body.md` → Rollback).


## AC eşlemesi

| AC | Durum | Kanıt (test yolu) |
|---|---|---|
| (a) Onay akışı **gerçek impact** döndürüyor | unit+contract yeşil; DB kanıtı CI'da | `src/leaves/leave.repository.spec.ts` (etki hazırlama + sayaçlar), `src/leaves/leave.service.spec.ts` (yanıt sözleşmesi); PG: `test/database/leave-decision-transaction.spec.ts` "approves with the server-computed impact…" (3 occurrence + ad çözümleme + aday) |
| (b) impact/audit/outbox **atomik**, kısmi kayıt yok | unit+contract yeşil; PG rollback testi CI'da | `src/leaves/leave.repository.spec.ts` (aynı `EntityManager`, audit hatası yayılır), `test/database/…` "rolls back decision, projections, audit and outbox together" |
| (c) self-approval + kimlik hatası **deny-safe** | kanıtlandı | `src/leaves/leave.service.spec.ts` (requester / aynı öğretmen / belirsiz kimlik / çözülemeyen kimlik — hepsi mutasyondan önce deny); PG: `test/database/…` "denies self-approval … without writing rows" (#340/#277 davranışı korunur) |
| (d) Test onaylı leave'i **SQL/fetch ile üretmiyor** | kanıtlandı | `test/database/…` yalnız referans tablolara yazar; program `ScheduleService`, izin `LeaveRepository.create`, karar `LeaveService.decide` ile üretilir; `test/acceptance-guard/acceptance-evidence.guard.spec.ts` PASS |
| (e) **Ham ID sızıntısı yok** (okunabilir adlar) | kanıtlandı | `src/daily-operations/leave-approval-impact.spec.ts` + `test/contracts/leave-decision-impact.contract.spec.ts` (alan allowlist'i `...Id/...Uuid` + PII desenlerine kapalı), `src/leaves/leave.service.spec.ts` (gövdede UUID yok; `etag` opak If-Match jetonu) |
| If-Match/version + stale recovery | kanıtlandı | `test/contracts/leave-decision-impact.contract.spec.ts` (`LEAVE_VERSION_REQUIRED`/`LEAVE_VERSION_MISMATCH`), `src/leaves/leave.repository.spec.ts` (stale → 412, port/audit çağrılmaz), `test/database/…` "recovers from a stale If-Match version…" |
| Sıfır etki açıkça ifade edilir | kanıtlandı | `zeroImpact` + `zeroImpactReason` + `zeroImpactDetail`; `leave-approval-impact.spec.ts`, `leave.service.spec.ts`; PG: `test/database/…` "states a zero-impact approval explicitly without writing projections" |

## Değişen dosyalar

| Dosya | Rol |
|---|---|
| `src/leaves/leave.service.ts` | `decide()`: karantina kaldırıldı, deny-safe kapı öne alındı, okunabilir karar yanıtı |
| `src/leaves/leave-errors.ts` | `LeaveImpactAnalysisNotReadyException` kaldırıldı |
| `src/leaves/leave.repository.ts` | Karar transaction'ı: etki portu + tek `manager` (audit/outbox aynı transaction) |
| `src/leaves/leave-approval-impact.port.ts` *(yeni)* | Çağıranın `EntityManager`'ı ile çalışan etki portu |
| `src/leaves/leave-decision-labels.ts` *(yeni)* | Okunabilir etiketler + karar yanıtı alan allowlist'i |
| `src/leaves/leaves.module.ts` | Port → `DailyOperationsRepository` bağlantısı |
| `src/daily-operations/leave-approval-impact.ts` *(yeni)* | Onay etki tipleri, zero-impact kodları, saf etiket fonksiyonları |
| `src/daily-operations/daily-operations.repository.ts` | `prepareApprovalImpact` (hesap + açık projeksiyon + ad çözümleme); impact sorgusuna ad JOIN'leri |
| `src/daily-operations/daily-operations.module.ts` | `DailyOperationsRepository` dışa açıldı |
| `src/leaves/leave.service.spec.ts` · `src/leaves/leave.repository.spec.ts` | Yeni karar sözleşmesi (R1) |
| `src/daily-operations/leave-approval-impact.spec.ts` *(yeni)* | Saf etiket/zero-impact + allowlist testleri |
| `test/contracts/leave-decision-impact.contract.spec.ts` *(yeni)* | R1 karar/etki sözleşmesi (tek transaction, ham kimlik yok, zero-impact) |
| `test/contracts/leave-runtime.contract.spec.ts` | Karantina pini kaldırıldı; yerine yeni kod pinleri |
| `test/database/leave-decision-transaction.spec.ts` *(yeni)* | Gerçek PostgreSQL: onay, rollback, sıfır etki, deny-safe, stale recovery |

Dilim boyutu: **+1.497 / −48 satır** (`src/**` + `test/**`; yeni dosyalar dâhil) — ≤ ~1.500 sınırı içinde.
Kanıt dosyaları (`artifacts/R1/**`, +261 satır) kod dilimi sayımına dâhil değildir.

## Bilinen boşluklar

1. **Doküman senkronu (ORCH/A6 işi):** `docs/leaves/leave-runtime-contract.md` hâlâ "approval fails closed with
   `IMPACT_ANALYSIS_NOT_READY`" diyor ve "Out of scope" bölümünde "Schedule impact write, Daily Operations
   projection, replacement candidate calculation" yazıyor. R1 bunları kapsam içine aldı; `docs/**` A6 sahipliğinde
   olduğu için bu dilimde **dokunulmadı** (istenen yama §6.2 devir paketinde). Benzer şekilde
   `frontend/ux/spec.md` §13 ve `frontend/runtime/app.js` içindeki `IMPACT_ANALYSIS_NOT_READY` etiketi A5/A6
   tarafından temizlenmelidir.
2. **GET impact/candidates uçları** ham kimlik döndürmeye devam eder (R2 yüzeyi;
   `test/contracts/daily-operations-queue-version.contract.spec.ts` ile PII-free pinli). AC (e) bu dilimde
   **karar yanıtı** için uygulanmıştır; ayrım bilinçlidir.
3. `etag` alanı opak sürüm jetonudur (If-Match için kaynağa bağlı) ve kullanıcı yüzeyine basılmaz.
4. Yerel PostgreSQL olmadığı için PG senaryoları ilk kez CI'da çalışacak (DB Smoke); olası ilk kırmızı
   fixture/kolon uyumsuzluğudur ve aynı dilimde RCA ile düzeltilir.



## 7. Verdict — §8 kanıt #7

- Durum: **BEKLİYOR** — `artifacts/verify/R1/verdict.md` (A7). A7 GO'suz PR açılmaz.
