import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #266 — Transactional outbox (absence → veli bildirimi).
 *
 * Kilitlenen bir yoklama oturumundaki devamsızlıklar, domain transaction'ının
 * İÇİNDE bu tabloya yazılır (outbox deseni): bildirim niyeti, domain
 * mutasyonuyla atomik olarak kalıcılaşır ve gönderim ayrı bir relay'e bırakılır.
 *
 * - `dedupe_key` + UNIQUE(tenant_id, dedupe_key) → **idempotent** enqueue
 *   (aynı oturum/öğrenci için tek satır; tekrar işleme kayıt çoğaltmaz).
 * - `status`: pending | blocked_consent | dispatched | failed
 * - `payload_masked`: yalnız maskelenmiş/minimal veri (PII taşımaz).
 * - `consent_version`: hangi onay sürümüyle kuyruğa alındığı izlenebilir.
 *
 * Immutable kural §6: yeni FOLLOW-UP migration; DDL idempotenttir.
 */
export class CreateNotificationOutbox1829000000000 implements MigrationInterface {
  name = 'CreateNotificationOutbox1829000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_outbox" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "dedupe_key" varchar(160) NOT NULL,
        "event_type" varchar(60) NOT NULL,
        "student_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "channel" varchar(32) NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "payload_masked" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reason" varchar(64) NULL,
        "consent_version" integer NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "available_at" timestamptz NOT NULL DEFAULT now(),
        "dispatched_at" timestamptz NULL,
        "created_by_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_notification_outbox_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_notification_outbox_status"
          CHECK ("status" IN ('pending', 'blocked_consent', 'dispatched', 'failed'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_notification_outbox_tenant_dedupe"
        ON "notification_outbox" ("tenant_id", "dedupe_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_outbox_pending"
        ON "notification_outbox" ("status", "available_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notification_outbox_pending"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_notification_outbox_tenant_dedupe"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_outbox"`);
  }
}
