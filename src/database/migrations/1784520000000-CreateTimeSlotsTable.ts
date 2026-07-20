import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTimeSlotsTable1784520000000 implements MigrationInterface {
  name = 'CreateTimeSlotsTable1784520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id ON branches (tenant_id, id)`);
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
