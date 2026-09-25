## Amaç

#263 LEAVE-OPS (M4, P0) kapsamında `LeaveService.decide()` hâlâ **koşulsuz** `LeaveImpactAnalysisNotReadyException`
atıyordu (`src/leaves/leave.service.ts:121`): yönetici onayı hiçbir etki hesabı yapmadan reddediliyordu. Bu PR
karantinayı kaldırır ve onay/ret kararını gerçek, sunucu hesaplı etki analiziyle birlikte **tek PostgreSQL
transaction'ında** üretir. Böylece leave onayı operasyonel olarak kullanılabilir hâle gelir ve "onayladım ama hangi
dersler boşta?" sorusu sunucu tarafında yanıtlanır.

## Kapsam

- `src/leaves/leave.service.ts` — `decide()`: karantina satırı kaldırıldı; deny-safe kapı (self-approval + kimlik)
  mutasyondan **önce**; yanıt ham UUID yerine okunabilir alanlar (`decisionLabel`, `periodLabel`, `durationLabel`,
  `reasonLabel`, etki dersleri, adaylar) döndürür; sıfır etki `zeroImpact` + `zeroImpactReason` + `zeroImpactDetail`
  ile açıkça ifade edilir.
- `src/leaves/leave-errors.ts` — `LeaveImpactAnalysisNotReadyException` kaldırıldı (ölü karantina kodu bırakılmadı).
- `src/leaves/leave.repository.ts` — `decide()` tek transaction içinde: `pessimistic_write` kilit + sürüm/terminal
  kontrolü → etki hesabı + açık projeksiyonlar (yeni port, **çağıranın `EntityManager`'ı**) → karar güncellemesi →
  durable audit (`leave.approved.v1` / `leave.rejected.v1`) → idempotent outbox.
- `src/leaves/leave-approval-impact.port.ts` (yeni) + `src/leaves/leave-decision-labels.ts` (yeni) — port sözleşmesi ve
  okunabilir etiketler/alan allowlist'i.
- `src/daily-operations/leave-approval-impact.ts` (yeni) + `daily-operations.repository.ts` — `prepareApprovalImpact`:
  yayınlanmış program occurrence'ları, ders/sınıf/oda/öğretmen adı çözümleme, aday öğretmen listesi (uygunluk kaynağı
  yoksa "kesinleşmedi", sessiz boş liste değil), açık `daily_operation_lessons` projeksiyonları.
- Testler: `src/leaves/*.spec.ts`, `src/daily-operations/leave-approval-impact.spec.ts`,
  `test/contracts/leave-decision-impact.contract.spec.ts`, `test/database/leave-decision-transaction.spec.ts` (gerçek
  PostgreSQL) ve `test/contracts/leave-runtime.contract.spec.ts` (karantina pini → yeni kod pinleri).

## Kapsam dışı

- Substitute assignment CRUD / clear (R2), aday uç noktasının zenginleştirilmesi (R2).
- Bakiye tahakkuk/devir ve tenant/branch timezone (R3).
- Bildirim gönderimi/relay (A3), UI/erişilebilirlik (A5), doküman reconcile (A6).
- Migration **yok** (mevcut `1802000000000`/`1803000000000` şeması yeterli) → `1830*` bloğu bu dilimde kullanılmadı.
- Ortak dosyalar (`src/app.module.ts`, `package.json`, `src/database/data-source.ts`) değiştirilmedi.

## Acceptance criteria

- [x] **(a)** Onay akışı gerçek impact döndürüyor: 3 occurrence + ders/sınıf/oda/öğretmen adları + aday listesi →
  `src/leaves/leave.service.spec.ts`, `src/leaves/leave.repository.spec.ts`, PG: `test/database/leave-decision-transaction.spec.ts`
- [x] **(b)** impact/audit/outbox atomik; audit hatasında **kısmi kayıt yok** (karar `pending`, projeksiyon/audit/outbox
  satırı 0) → `src/leaves/leave.repository.spec.ts` + PG rollback testi + mutasyon kontrolü (§4)
- [x] **(c)** self-approval ve kimlik hatası deny-safe (requester, aynı öğretmen, belirsiz/çözülemeyen kimlik) →
  `src/leaves/leave.service.spec.ts` + PG testi; #340/#277 davranışı korunur
- [x] **(d)** Test onaylı leave'i SQL/fetch ile üretmiyor: yalnız referans fixture; program `ScheduleService`, izin
  `LeaveRepository.create`, karar `LeaveService.decide` → `test/acceptance-guard` PASS
- [x] **(e)** Ham ID sızıntısı yok; okunabilir adlar → alan allowlist'i testleri (`.Id/.Uuid` ve PII desenleri kapalı)
- [x] If-Match/version sözleşmesi (`LEAVE_VERSION_REQUIRED` 428 / `LEAVE_VERSION_MISMATCH` 412) + stale recovery
- [x] Sıfır etki açıkça ifade edilir (sessiz boş dönüş yok)

## Test çıktısı

| Doğrulama | Komut | Sonuç |
|---|---|---|
| Tip kapısı | `npx tsc -p tsconfig.json --noEmit` | **exit 0**, stdout boş |
| Tam jest | `npx jest --runInBand` | **exit 0** — 108 passed / 9 skipped suite · **908 passed**, 37 skipped test, kırmızı yok |
| Hedef suite'ler | `npx jest --runInBand src/leaves src/daily-operations test/contracts test/acceptance-guard test/kvkk test/rbac test/database` | **exit 0** — 40 passed / 9 skipped suite · **301 passed**, 37 skipped test |
| Mutasyon 1 (etki transaction dışına) | hedef jest | **exit 1** — 2 failed suite, 2 failed test → geri alındı |
| Mutasyon 2 (outbox transaction dışına) | hedef jest | **exit 1** — 2 failed suite, 3 failed test → geri alındı |
| Rollback provası | `git revert 12876bc` + hedef jest | **exit 0** — 12 suite / 110 test yeşil → `git reset --hard` ile geri uygulandı |
| DB suite (gerçek PostgreSQL) | CI `npm run qa:db` (`test:database:required`) | yerelde PostgreSQL yok → **CI'da koşacak**; run URL'i PR sonrası eklenecek |

Ayrıntı ve ham çıktı satırları: `artifacts/R1/evidence.md` §1, §4, §6.


## KVKK/audit etkisi

- **Audit:** başarı audit'i (`leave.approved.v1` / `leave.rejected.v1`) domain mutasyonu, projeksiyonlar ve outbox ile
  **aynı** `EntityManager` üzerinden yazılır (constitution Madde III); audit hatası tüm transaction'ı geri alır.
  Audit metadata'sı yalnız allowlist'lenmiş alan adlarını taşır (`status`, `coverageStatus`,
  `dailyOperationsProjection`, `version`); ad/e-posta/serbest metin/sağlık detayı **girmez** (test bunu doğrular).
- **KVKK:** çözümlenen öğretmen adları yalnız yetkili karar yanıtında (`leave:approve` / `leave:reject`) yaşar; audit,
  outbox payload'ı ve loglara yazılmaz (PG testi adların audit/outbox'ta bulunmadığını doğrular). Outbox payload'ı
  yalnız kimlik/sayaç/durum alanları içerir. `reasonCode` sınıflandırması (ör. `health`) yalnız kategori kodu +
  okunabilir etikettir; sağlık detayı taşımaz.
- **RBAC:** uçların `@Permissions` sözleşmesi değişmedi (`leave:approve`, `leave:reject`); tenant kapsamı
  `assertTenantScope` + kilitli tenant-scoped sorgularla korunur; yeni port yalnız karar transaction'ında çağrılır.
- Yeni secret/PII artefaktı yok; loglarda token/parola/iletişim verisi bulunmaz (§5 redaction taraması).

## Rollback

- Tek adım: bu PR'ı revert et (`git revert <merge-sha>`). Dilim kendi içinde tutarlıdır (yeni dosyalar + testler
  birlikte gelir/gider); şema/migration değişikliği olmadığı için veri geri alma gerekmez.
- Daha dar seçenek (tek satır): `LeaveService.decide()` içinde karar çağrısından önce
  `if (dto.decision === APPROVED) throw new LeaveImpactAnalysisNotReadyException();` eklenerek onay yeniden
  fail-closed yapılabilir (eski karantina davranışı); bu acil durum yoludur ve karantina pinini geri getirmeyi
  gerektirir.
- Prova: `artifacts/R1/evidence.md` §6 — revert edilmiş ağaçta hedef suite'ler yeşil, ardından değişiklik geri
  uygulandı.

## CI run referansı

Bu PR'ın kendi koşuları (run id'leri ile); **yeşil olmadan merge talep edilmez** ve `runtime` sınıflandırması beyan edilmez:

| Check | Run |
|---|---|
| DB Smoke (`npm run qa:db` → `test:database:required`, skip yasak) | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296243 |
| Backend CI | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296282 |
| Sprint 1 Quality Gate | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296272 |
| Gate 1 CI | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296301 |
| P0 browser E2E and artifact evidence | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296293 |
| PR Governance | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296449 |
| Sensitive Pattern Scanner | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296274 |
| GitGuardian scan | https://github.com/sisbas/OkulYonetimSaaS/actions/runs/35926296161 |

Run URL'leri yeşile döndükçe `artifacts/R1/evidence.md` §2/§3 satırlarına işlenecektir. `skipped`/`cancelled`/`queued` **PASS sayılmaz**.

