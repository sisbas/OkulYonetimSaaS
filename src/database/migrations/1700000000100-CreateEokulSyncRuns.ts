import { MigrationInterface, QueryRunner } from 'typeorm';

// OKUL-05: MEB e-okul senkronizasyon kayıt tablosu.
export class CreateEokulSyncRuns1700000000100 implements MigrationInterface {
  name = 'CreateEokulSyncRuns1700000000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "eokul_sync_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity_type" varchar(32) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "external_id" varchar(64),
        "records_total" int NOT NULL DEFAULT 0,
        "records_upserted" int NOT NULL DEFAULT 0,
        "records_failed" int NOT NULL DEFAULT 0,
        "error_message" text,
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_eokul_sync_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_eokul_sync_tenant_status" ON "eokul_sync_runs" ("tenant_id", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "eokul_sync_runs"`);
  }
}
