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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
