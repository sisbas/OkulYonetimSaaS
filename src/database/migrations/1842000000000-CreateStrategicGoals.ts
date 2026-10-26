import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStrategicGoals1842000000000 implements MigrationInterface {
  name = 'CreateStrategicGoals1842000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "strategic_goals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "academic_year" varchar(32) NOT NULL,
        "metric_key" varchar(120) NOT NULL,
        "metric_label" varchar(200) NULL,
        "target_value" numeric(14, 4) NOT NULL,
        "progress_value" numeric(14, 4) NULL,
        "created_by_user_id" uuid NULL,
        "deleted_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_strategic_goals_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    // Tekillik kısmi indeksle kurulur: yumuşak silinen hedef aynı yıl+metrik
    // için yeniden açılabilir, aktif iki hedef ise DB'de reddedilir.
    await runner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_strategic_goals_tenant_year_metric"
        ON "strategic_goals" ("tenant_id", "academic_year", "metric_key")
        WHERE "deleted_at" IS NULL`,
    );
    await runner.query(
      `CREATE INDEX IF NOT EXISTS "idx_strategic_goals_tenant_year"
        ON "strategic_goals" ("tenant_id", "academic_year")`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX IF EXISTS "idx_strategic_goals_tenant_year"');
    await runner.query('DROP INDEX IF EXISTS "uq_strategic_goals_tenant_year_metric"');
    await runner.query('DROP TABLE IF EXISTS "strategic_goals"');
  }
}
