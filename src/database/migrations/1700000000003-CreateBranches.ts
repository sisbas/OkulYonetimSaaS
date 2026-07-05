import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBranches1700000000003 implements MigrationInterface {
  name = 'CreateBranches1700000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id),
        name varchar(255) NOT NULL,
        code varchar(80) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'active',
        address text NULL,
        phone varchar(40) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT uq_branches_tenant_code UNIQUE (tenant_id, code),
        CONSTRAINT chk_branches_status CHECK (status IN ('active', 'inactive', 'deleted'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_branches_tenant_status ON branches(tenant_id, status)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS branches`);
  }
}
