# Audit Retention ve Zincir Checkpoint (#259)

## Amaç

Saklama süresi dolan audit kayıtlarını, **tamper-evident zinciri bozmadan**
kırpmak ve kırpılan geçmişin bütünlüğünü kanıtlanabilir tutmak.

## Saklama politikası

| Kapsam | Süre |
|---|---|
| Varsayılan (tüm aksiyonlar) | **2555 gün (7 yıl)** |
| `auth.*` (güvenlik/hesap verebilirlik) | 3650 gün (10 yıl) |
| `dataprotection.*` (KVKK kanıtı) | 3650 gün (10 yıl) |

- Varsayılan, `AUDIT_RETENTION_DEFAULT_DAYS` env'i ile geçersiz kılınabilir
  (pozitif tam sayı, en fazla 3650). Geçersiz değer **fail-closed** reddedilir.
- Aile bazlı süreler kod içindeki kayıt (`AUDIT_RETENTION_FAMILY_DAYS`) ile
  yönetilir ve env varsayılanını geçersiz kılar.

## Kırpma (prune) sözleşmesi

1. Kırpma **zincirin başından itibaren kesintisiz prefix** olarak yapılır.
   Zincirin ortasından satır silmek bütünlüğü kanıtlanamaz hâle getireceği için
   reddedilir.
2. Silmeden **önce** `audit_chain_checkpoints` tablosuna bir checkpoint yazılır:
   kırpılan son `sequence`, o satırın `entry_hash`'i (`head_hash`) ve bu özetin
   HMAC imzası (`signature`, `signature_key_id`).
3. Kırpma işleminin kendisi de aynı transaction'da durable audit kaydı üretir
   (`audit.retention.pruned`; sayaç + sıra + dry-run bayrağı).
4. Yeni yazımlar zincire **checkpoint head'inden** devam eder
   (`AuditLogRepository.insert` önce son satırı, yoksa son checkpoint'i okur).
5. Doğrulama: kalan zincir `verifyAuditChain(records, { startPrevHash: checkpoint.headHash })`
   ile doğrulanır; genesis'ten doğrulama bilinçli olarak **başarısız** olur
   (checkpoint zinciri çıpalar).

## İşletim

- Plan (dry-run) ve kırpma çağrıları `reason` alanı ister
  (`^[a-z0-9_.:-]{3,60}$`, ör. `scheduled.retention.2026q3`).
- Aktör zorunludur (audit kaydı `actorUserId` taşır).
- Kırpma zincir global olduğu için platform seviyesindedir (tenant bazlı değil).
- Sınırlar: `maxRows` ≤ 50.000, tarama penceresi ≤ 50.000 satır (varsayılan 5.000).

## Kanıt

- `test/database/audit-retention.db.spec.ts` (gerçek PostgreSQL, CI DB Smoke):
  dry-run silmez; prune checkpoint yazar; kalan zincir checkpoint'ten doğrulanır;
  genesis'ten doğrulama kırılır; yeni yazım checkpoint'ten devam eder; taze
  zincir kırpılmaz; geçersiz `reason` reddedilir.
- `src/common/audit/audit-retention.policy.spec.ts`: varsayılan/aile/env
  çözümlemesi ve fail-closed doğrulama.

## Rollback

- Migration geri alma: `1828000000000-AddAuditChainCheckpoints` down'ı indeks ve
  tabloyu düşürür (audit satırları korunur). Checkpoint'ler silinirse zincir
  doğrulaması genesis'ten beklenen duruma döner; kırpılmış satırlar geri gelmez
  (geri dönüşü yoktur — bu yüzden prune yalnız saklama süresi dolmuş prefix
  üzerinde çalışır).

## HTTP yüzeyi (`/api/v1/audit`)

| Route | Yetki | Amaç |
|---|---|---|
| `GET /api/v1/audit/logs` | `audit_log:read` | Tenant-scoped, KVKK maskeli okuma (`entityType`, `entityId`, `actorUserId`, `actions`, `from`, `to`, `limit`, `offset`) |
| `GET /api/v1/audit/verify` | `audit_log:operations:read` | Zincir doğrulama; `expectedHeadHash` / `expectedLastSequence` ile kırpma tespiti |
| `POST /api/v1/audit/retention/plan` | `audit_log:retention:run` | Salt okunur kırpma planı (hangi prefix, kaç satır) |
| `POST /api/v1/audit/retention/run` | `audit_log:retention:run` | Kırpma koşusu; `{ reason, dryRun?, maxRows? }` — **varsayılan `dryRun: true`** |

Sözleşme notları:

- Tüm route'lar `AuthGuard('jwt')` + `TenantScopeGuard` altındadır ve her route
  `@Permissions` taşır (metadata'sız route global guard'ları atlar → fail-open;
  bu yüzden `test/rbac/controller-enforcement-consistency.spec.ts` ile zorunlu).
- `logs` tenant sınırının dışına çıkamaz; PII alanları maskelenir ve okuma
  işlemi `dataprotection.export.redacted` olarak **redactionReceipt** ile
  audit'lenir (KVKK madde 12 teknik tedbir kanıtı).
- `verify` varsa son retention checkpoint'inden başlar; checkpoint yoksa
  genesis'ten doğrular. Sonuç `valid`, `reason`, `checkedRows`,
  `lastCheckpoint`, `startedFromCheckpoint` alanlarını döner.
- `retention/run` yıkıcıdır: yalnız `tenant_admin` (yeni izin
  `audit_log:retention:run`), `reason` zorunlu ve `dryRun` varsayılan **true**.
- Parametreler fail-closed doğrulanır (UUID/hash/ISO tarih/aralık); geçersiz
  girdi `400` döner.

