import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTimeSlotsTable1784520000000 implements MigrationInterface {
  name = 'CreateTimeSlotsTable1784520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_class index_relation
          JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
          JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
          JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
          WHERE namespace_relation.nspname = current_schema()
            AND table_relation.relname = 'branches'
            AND index_relation.relname = 'uq_branches_tenant_id'
            AND index_metadata.indisunique
            AND pg_get_indexdef(index_relation.oid) LIKE '%(tenant_id, id)%'
        ) THEN
          RAISE EXCEPTION 'Required shared Branch index uq_branches_tenant_id (tenant_id, id) is missing; apply Branch schema migrations before TimeSlot';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS time_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        day_of_week smallint NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        order_index integer,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz,
        CONSTRAINT fk_time_slots_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_time_slots_branch_same_tenant FOREIGN KEY (tenant_id, branch_id)
          REFERENCES branches (tenant_id, id) ON DELETE RESTRICT,
        CONSTRAINT chk_time_slots_day_of_week CHECK (day_of_week BETWEEN 1 AND 7),
        CONSTRAINT chk_time_slots_time_order CHECK (end_time > start_time),
        CONSTRAINT chk_time_slots_status CHECK (status IN ('active', 'inactive')),
        CONSTRAINT chk_time_slots_order_index CHECK (order_index IS NULL OR order_index > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_active_interval
      ON time_slots (tenant_id, branch_id, day_of_week, start_time, end_time)
      WHERE status = 'active'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_time_slots_tenant_branch_day_status_order
      ON time_slots (tenant_id, branch_id, day_of_week, status, order_index)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_time_slots_tenant_branch_day_status_order`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_time_slots_active_interval`);
    await queryRunner.query(`DROP TABLE IF EXISTS time_slots`);
  }
}
