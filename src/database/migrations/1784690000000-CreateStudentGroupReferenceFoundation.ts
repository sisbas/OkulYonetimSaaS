import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStudentGroupReferenceFoundation1784690000000 implements MigrationInterface {
  name = 'CreateStudentGroupReferenceFoundation1784690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS student_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        code varchar(40) NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deactivated_at timestamptz NULL,
        deleted_at timestamptz NULL,
        CONSTRAINT fk_student_groups_tenant
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_student_groups_branch_same_tenant
          FOREIGN KEY (tenant_id, branch_id)
          REFERENCES branches(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT chk_student_groups_status CHECK (status IN ('active', 'inactive'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_student_groups_tenant_id ON student_groups (tenant_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_student_groups_branch_id ON student_groups (tenant_id, branch_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_student_groups_active_code ON student_groups (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL AND deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_student_groups_tenant_branch_status ON student_groups (tenant_id, branch_id, status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_student_groups_tenant_branch_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_student_groups_active_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_student_groups_branch_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_student_groups_tenant_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS student_groups`);
  }
}
