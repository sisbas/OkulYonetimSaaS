import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reports foundation (Refs #221)
 *
 * Creates the backing tables for the Raporlama module:
 *  - students            : tenant-scoped öğrenci kayıtları (PII taşır)
 *  - guardians           : tenant-scoped veli/kanuni temsilci kayıtları (PII taşır)
 *  - attendance_records  : tenant-scoped devamsızlık kayıtları (öğrenci bazlı durum)
 *
 * attendance_sessions is owned by 1826000000000-CreateAttendanceSessions (#265).
 *
 * All tables are tenant-scoped and carry KVKK-relevant PII. The Raporlama
 * export layer masks this PII unless the caller holds the dedicated
 * report permission (see src/reports/export/redaction.layer.ts).
 */
export class CreateReportsFoundation1810000000000 implements MigrationInterface {
  name = 'CreateReportsFoundation1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS students (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        student_code varchar(40) NULL,
        first_name varchar(80) NOT NULL,
        last_name varchar(80) NOT NULL,
        birth_date date NULL,
        gender varchar(16) NULL,
        enrollment_status varchar(16) NOT NULL DEFAULT 'active',
        enrollment_date date NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deactivated_at timestamptz NULL,
        deleted_at timestamptz NULL,
        CONSTRAINT fk_students_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        CONSTRAINT fk_students_branch_same_tenant
          FOREIGN KEY (tenant_id, branch_id)
          REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
        CONSTRAINT chk_students_enrollment_status
          CHECK (enrollment_status IN ('active', 'inactive', 'graduated', 'transferred'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_students_tenant_id ON students (tenant_id, id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_students_branch_code ON students (tenant_id, branch_id, lower(student_code)) WHERE student_code IS NOT NULL AND deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_students_tenant_branch_status ON students (tenant_id, branch_id, enrollment_status)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS guardians (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        student_id uuid NOT NULL,
        full_name varchar(160) NOT NULL,
        relationship varchar(32) NULL,
        phone varchar(40) NULL,
        email varchar(160) NULL,
        address text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT fk_guardians_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        CONSTRAINT fk_guardians_student_same_tenant
          FOREIGN KEY (tenant_id, student_id)
          REFERENCES students(tenant_id, id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_guardians_tenant_id ON guardians (tenant_id, id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_guardians_tenant_student ON guardians (tenant_id, student_id)`);

    // attendance_sessions is owned by 1826000000000-CreateAttendanceSessions (#265).
    // This migration intentionally does not create it to avoid duplicate table
    // definition conflict. See #265.

    // Raporlama modülü tabloları (OKUL-09).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS report_definitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(160) NOT NULL,
        type varchar(48) NOT NULL,
        query_spec jsonb NOT NULL DEFAULT '{}',
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT fk_report_definitions_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_report_definitions_tenant_id ON report_definitions (tenant_id, id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_report_definitions_tenant_type ON report_definitions (tenant_id, type)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS report_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        definition_id uuid NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'pending',
        result_json jsonb NULL,
        generated_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT fk_report_runs_tenant
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
        CONSTRAINT fk_report_runs_definition_same_tenant
          FOREIGN KEY (tenant_id, definition_id)
          REFERENCES report_definitions(tenant_id, id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_report_runs_tenant_id ON report_runs (tenant_id, id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_report_runs_tenant_definition ON report_runs (tenant_id, definition_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS report_runs`);
    await queryRunner.query(`DROP TABLE IF EXISTS report_definitions`);
    // attendance_sessions is owned by 1826000000000-CreateAttendanceSessions (#265).
    await queryRunner.query(`DROP TABLE IF EXISTS guardians`);
    await queryRunner.query(`DROP TABLE IF EXISTS students`);
  }
}
