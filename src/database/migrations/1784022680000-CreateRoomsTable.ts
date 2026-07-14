import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoomsTable1784022680000 implements MigrationInterface {
  name = 'CreateRoomsTable1784022680000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        code varchar(40),
        capacity integer,
        description text,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deactivated_at timestamptz,
        CONSTRAINT fk_rooms_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT chk_rooms_status CHECK (status IN ('active', 'inactive')),
        CONSTRAINT chk_rooms_capacity CHECK (capacity IS NULL OR capacity > 0)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_tenant_branch_code ON rooms (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_rooms_tenant_branch_status ON rooms (tenant_id, branch_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_rooms_tenant_branch_name ON rooms (tenant_id, branch_id, lower(name))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_rooms_tenant_branch_name`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_rooms_tenant_branch_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_rooms_tenant_branch_code`);
    await queryRunner.query(`DROP TABLE IF EXISTS rooms`);
  }
}
