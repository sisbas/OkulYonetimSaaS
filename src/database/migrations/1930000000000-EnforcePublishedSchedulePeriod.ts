import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #453 — aynı tenant+branch içinde yayınlanmış programların dönemleri
 * örtüşemez. Uygulama katmanındaki sorgu erken hata verir; bu EXCLUDE
 * constraint yarış durumunda da veritabanını son otorite yapar.
 */
export class EnforcePublishedSchedulePeriod1930000000000 implements MigrationInterface {
  name = 'EnforcePublishedSchedulePeriod1930000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass(current_schema() || '.schedules') IS NULL THEN
          RAISE EXCEPTION 'Published schedule period preflight failed: schedules table is missing';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE schedules
      ADD CONSTRAINT ex_schedules_published_period
      EXCLUDE USING gist (
        tenant_id WITH =,
        branch_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
      )
      WHERE (status = 'published')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE schedules DROP CONSTRAINT IF EXISTS ex_schedules_published_period`);
  }
}
