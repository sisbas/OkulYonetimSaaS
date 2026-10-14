import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #266 N1c — Immutable notification snapshot + draft statuses.
 *
 * - `snapshot` jsonb: enqueue sırasında kaynak/iletişim/onay/şablon
 *   durumunu kalıcı, değişmez (immutable) olarak saklar. Bir kez
 *   yazıldıktan sonra güncellenmez; denetim ve operatör onayı için
 *   o anki durumu korur.
 * - Status CHECK genişletmesi: `approved` (operatör onayladı) ve
 * `closed` (operatör iptal etti) eklendi.
 *
 * Immutable kural §6: yeni FOLLOW-UP migration; DDL idempotenttir.
 */
export class AddNotificationSnapshot1860000000000 implements MigrationInterface {
  name = 'AddNotificationSnapshot1860000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP CONSTRAINT IF EXISTS "chk_notification_outbox_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD CONSTRAINT "chk_notification_outbox_status"
         CHECK ("status" IN ('pending', 'blocked_consent', 'dispatched', 'failed', 'approved', 'closed'))`,
    );
    await queryRunner.query(
      `CREATE OR REPLACE FUNCTION trg_notification_outbox_snapshot_immutable()
       RETURNS trigger AS $$
       BEGIN
         IF TG_OP = 'UPDATE' THEN
           IF OLD.snapshot IS NOT NULL AND NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
             RAISE EXCEPTION 'notification_outbox.snapshot is immutable';
           END IF;
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_notification_outbox_snapshot_immutable ON "notification_outbox"`,
    );
    await queryRunner.query(
      `CREATE TRIGGER trg_notification_outbox_snapshot_immutable
         BEFORE UPDATE ON "notification_outbox"
         FOR EACH ROW EXECUTE FUNCTION trg_notification_outbox_snapshot_immutable();`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_notification_outbox_snapshot_immutable ON "notification_outbox"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS trg_notification_outbox_snapshot_immutable();`);
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP CONSTRAINT IF EXISTS "chk_notification_outbox_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD CONSTRAINT "chk_notification_outbox_status"
         CHECK ("status" IN ('pending', 'blocked_consent', 'dispatched', 'failed'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP COLUMN IF EXISTS "snapshot"`,
    );
  }
}
