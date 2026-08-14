import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * OKUL-08 Parent Notification Service — notification_logs tablosu.
 *
 * tenant-scoped bildirim günlüğü. message_body_masked sütunu KVKK gereği
 * ham PII taşımaz (servis katmanında maskelenmiş halde yazılır).
 */
export class CreateNotificationLogs1820000000000 implements MigrationInterface {
  name = 'CreateNotificationLogs1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        notification_id varchar(64) NOT NULL,
        subject_id varchar(64) NOT NULL,
        channel varchar(32) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'draft',
        message_body_masked text NULL,
        reason varchar(64) NULL,
        sent_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_notification_logs_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_logs_tenant_notification ON notification_logs (tenant_id, notification_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_logs_tenant_subject ON notification_logs (tenant_id, subject_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_logs`);
  }
}
