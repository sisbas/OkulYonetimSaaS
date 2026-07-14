import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoursesTable20260714095100 implements MigrationInterface {
  name = 'CreateCoursesTable20260714095100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        code varchar(40),
        description text,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deactivated_at timestamptz,
        CONSTRAINT fk_courses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT chk_courses_status CHECK (status IN ('active', 'inactive'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_tenant_code ON courses (tenant_id, lower(code)) WHERE code IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_courses_tenant_status ON courses (tenant_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_courses_tenant_name ON courses (tenant_id, lower(name))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_courses_tenant_name`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_courses_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_courses_tenant_code`);
    await queryRunner.query(`DROP TABLE IF EXISTS courses`);
  }
}
