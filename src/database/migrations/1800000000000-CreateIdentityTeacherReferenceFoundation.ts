import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityTeacherReferenceFoundation1800000000000
  implements MigrationInterface
{
  name = 'CreateIdentityTeacherReferenceFoundation1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
    await queryRunner.query(`
      DO $$
      DECLARE course_index_valid boolean;
      BEGIN
        IF to_regclass(current_schema() || '.courses') IS NULL THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: courses table is missing';
        END IF;
        IF to_regclass(current_schema() || '.branches') IS NULL THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: branches table is missing';
        END IF;
        IF to_regclass(current_schema() || '.users') IS NULL THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: users table is missing';
        END IF;
        IF EXISTS (
          SELECT 1
          FROM courses course_row
          LEFT JOIN tenants tenant_row ON tenant_row.id = course_row.tenant_id
          WHERE course_row.id IS NULL OR course_row.tenant_id IS NULL OR tenant_row.id IS NULL
        ) THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: course null or orphan tenant reference detected';
        END IF;
        IF EXISTS (
          SELECT tenant_id, id
          FROM courses
          GROUP BY tenant_id, id
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: duplicate course (tenant_id, id) rows detected';
        END IF;
        IF to_regclass(current_schema() || '.uq_courses_tenant_id') IS NULL THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: required Course-owned uq_courses_tenant_id index is missing';
        END IF;

        SELECT index_metadata.indisunique
           AND array_agg(column_metadata.attname ORDER BY key_columns.ordinality) = ARRAY['tenant_id', 'id']::name[]
        INTO course_index_valid
        FROM pg_class index_relation
        JOIN pg_index index_metadata ON index_metadata.indexrelid = index_relation.oid
        JOIN pg_class table_relation ON table_relation.oid = index_metadata.indrelid
        JOIN pg_namespace namespace_relation ON namespace_relation.oid = table_relation.relnamespace
        JOIN unnest(index_metadata.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality) ON true
        JOIN pg_attribute column_metadata
          ON column_metadata.attrelid = table_relation.oid
         AND column_metadata.attnum = key_columns.attnum
        WHERE namespace_relation.nspname = current_schema()
          AND table_relation.relname = 'courses'
          AND index_relation.relname = 'uq_courses_tenant_id'
        GROUP BY index_metadata.indisunique;

        IF NOT COALESCE(course_index_valid, false) THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: uq_courses_tenant_id exists with an invalid definition';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_class i
          JOIN pg_index ix ON ix.indexrelid = i.oid
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = current_schema()
            AND t.relname = 'branches'
            AND i.relname = 'uq_branches_tenant_id'
            AND ix.indisunique
        ) THEN
          RAISE EXCEPTION 'Identity teacher foundation preflight failed: required branch (tenant_id, id) unique index is missing';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
        employee_code varchar(40) NULL,
        first_name varchar(80) NOT NULL,
        last_name varchar(80) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deactivated_at timestamptz NULL,
        deleted_at timestamptz NULL,
        CONSTRAINT chk_teachers_status CHECK (status IN ('active', 'inactive'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_tenant_id ON teachers (tenant_id, id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_active_tenant_user ON teachers (tenant_id, user_id) WHERE user_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_active_employee_code ON teachers (tenant_id, lower(employee_code)) WHERE employee_code IS NOT NULL AND status = 'active' AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_teachers_tenant_status ON teachers (tenant_id, status)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS teacher_branches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        teacher_id uuid NOT NULL,
        branch_id uuid NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        effective_from date NOT NULL,
        effective_to date NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deactivated_at timestamptz NULL,
        deleted_at timestamptz NULL,
        CONSTRAINT fk_teacher_branches_teacher_same_tenant
          FOREIGN KEY (tenant_id, teacher_id)
          REFERENCES teachers(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_teacher_branches_branch_same_tenant
          FOREIGN KEY (tenant_id, branch_id)
          REFERENCES branches(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT chk_teacher_branches_status CHECK (status IN ('active', 'inactive')),
        CONSTRAINT chk_teacher_branches_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_branches_tenant_id ON teacher_branches (tenant_id, id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_branches_schedule_fk ON teacher_branches (tenant_id, branch_id, teacher_id, id)`,
    );
    await queryRunner.query(`
      ALTER TABLE teacher_branches
      ADD CONSTRAINT ex_teacher_branches_active_period
      EXCLUDE USING gist (
        tenant_id WITH =,
        teacher_id WITH =,
        branch_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
      )
      WHERE (status = 'active' AND deleted_at IS NULL)
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_teacher_branches_teacher_status ON teacher_branches (tenant_id, teacher_id, status, effective_from, effective_to)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_teacher_branches_teacher_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_teacher_branches_schedule_fk`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_teacher_branches_tenant_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS teacher_branches`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_teachers_tenant_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_teachers_active_employee_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_teachers_active_tenant_user`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_teachers_tenant_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS teachers`);
  }
}
