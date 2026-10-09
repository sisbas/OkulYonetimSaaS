import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #266 N2 — Bounded manual dispatch: claim/lease/fencing + durable receipts.
 *
 * Eklenen kalıcı alanlar (hiçbiri mevcut işi/receipt'i silmez):
 * - `claim_token`, `claimed_at`, `claim_expires_at`: satır kiralama (lease).
 *   Kiralık satır süre dışı kaldığında yeniden kiralanabilir (crash/restart
 *   uzlaşması); arka plan işçisi YOKTUR — tetikleme operatör eylemidir.
 * - `fencing_token`: her kiralamada monotonik artar; eskimiş (stale) işleyici
 *   `WHERE claim_token = $token` koşuluyla yazamaz (fencing).
 * - `cancelled_at`, `dead_lettered_at`, `last_error_code` (allowlist kod).
 * - Status CHECK: `dead_lettered` (sınırlı deneme tükendi), `uncertain`
 *   (sağlayıcı sonucu güvenilir bilinmiyor), `cancelled` (yaşam döngüsü
 *   iptali) eklenir; mevcut 6 değer korunur.
 * - `notification_dispatch_receipts`: dayanıklı (durable) sağlayıcı receipt'i.
 *   `UNIQUE (outbox_id, attempt)` idempotency'yi sağlar (tekrar denemede ikinci
 *   etki oluşmaz). `simulated = true` CHECK'i kasten zorunludur: N3 kapsamında
 *   gerçek dış teslimat YOKTUR; gerçek gönderim iddia eden satır yazılamaz.
 *
 * Roll-back notu (§11): `down()` şematayı geri alır ancak
 * `notification_dispatch_receipts` içindeki kanıt satırlarını SİLER — delil
 * kaybı riski taşır. Bu nedenle geri alma yerine roll-forward (ileri migration)
 * tercih edilir; `down()` yalnız şema tamamlığı için korunur.
 */
export class AddNotificationDispatch1870000000000 implements MigrationInterface {
  name = 'AddNotificationDispatch1870000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "claim_token" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "claimed_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "fencing_token" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "dead_lettered_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "last_error_code" varchar(64) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_outbox_claim"
         ON "notification_outbox" ("claim_expires_at")
         WHERE "claim_expires_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP CONSTRAINT IF EXISTS "chk_notification_outbox_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD CONSTRAINT "chk_notification_outbox_status"
         CHECK ("status" IN ('pending', 'blocked_consent', 'dispatched', 'failed',
                             'approved', 'closed', 'dead_lettered', 'uncertain', 'cancelled'))`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "notification_dispatch_receipts" (
         "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         "tenant_id" uuid NOT NULL,
         "outbox_id" uuid NOT NULL REFERENCES "notification_outbox"("id") ON DELETE RESTRICT,
         "attempt" integer NOT NULL,
         "fencing_token" integer NOT NULL,
         "outcome" varchar(32) NOT NULL,
         "simulated" boolean NOT NULL DEFAULT true,
         "provider_ref" varchar(120) NULL,
         "error_code" varchar(64) NULL,
         "receipt" jsonb NOT NULL DEFAULT '{}'::jsonb,
         "created_at" timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT "chk_notification_dispatch_receipt_outcome"
           CHECK ("outcome" IN ('provider_accepted', 'provider_rejected', 'uncertain')),
         CONSTRAINT "chk_notification_dispatch_receipt_simulated"
           CHECK ("simulated" = true),
         CONSTRAINT "uq_notification_dispatch_receipt_attempt"
           UNIQUE ("outbox_id", "attempt")
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_dispatch_receipts_tenant"
         ON "notification_dispatch_receipts" ("tenant_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_dispatch_receipts_outbox"
         ON "notification_dispatch_receipts" ("outbox_id", "attempt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // DİKKAT: receipt tablosunu düşürmek kanıt (evidence) siler — delil kaybı
    // riski. Yalnız şema tamamlığı için korunur; üretimde roll-forward kullanın.
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_dispatch_receipts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notification_outbox_claim"`);
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP CONSTRAINT IF EXISTS "chk_notification_outbox_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD CONSTRAINT "chk_notification_outbox_status"
         CHECK ("status" IN ('pending', 'blocked_consent', 'dispatched', 'failed', 'approved', 'closed'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "last_error_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "dead_lettered_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "cancelled_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "fencing_token"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "claim_expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "claimed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "claim_token"`,
    );
  }
}
