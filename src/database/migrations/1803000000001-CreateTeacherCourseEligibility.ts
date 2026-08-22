import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherCourseEligibility1803000000000 implements MigrationInterface {
  name = 'CreateTeacherCourseEligibility1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass(current_schema() || '.teachers') IS NULL THEN
          RAISE EXCEPTION 'TeacherCourse eligibility preflight failed: teachers table is missing';
        END IF;
        IF to_regclass(current_schema() || '.courses') IS NULL THEN
          RAISE EXCEPTION 'TeacherCourse eligibility preflight failed: courses table is missing';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM pg_class i
          JOIN pg_index ix ON ix.indexrelid = i.oid
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = current_schema()
            AND t.relname = 'teachers'
            AND i.relname = 'uq_teachers_tenant_id'
            AND ix.indisunique
        ) THEN
          RAISE EXCEPTION 'TeacherCourse eligibility preflight failed: required teacher (tenant_id, id) unique index is missing';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM pg_class i
          JOIN pg_index ix ON ix.indexrelid = i.oid
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = current_schema()
            AND t.relname = 'courses'
            AND i.relname = 'uq_courses_tenant_id'
            AND ix.indisunique
        ) THEN
          RAISE EXCEPTION 'TeacherCourse eligibility preflight failed: required course (tenant_id, id) unique index is missing';
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS teacher_courses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        teacher_id uuid NOT NULL,
        course_id uuid NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        effective_from date NOT NULL,
        effective_to date,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deactivated_at timestamptz,
        deleted_at timestamptz,
        CONSTRAINT fk_teacher_courses_teacher_same_tenant
          FOREIGN KEY (tenant_id, teacher_id)
          REFERENCES teachers(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT fk_teacher_courses_course_same_tenant
          FOREIGN KEY (tenant_id, course_id)
          REFERENCES courses(tenant_id, id)
          ON DELETE RESTRICT,
        CONSTRAINT chk_teacher_courses_status CHECK (status IN ('active', 'inactive')),
        CONSTRAINT chk_teacher_courses_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_courses_tenant_id
      ON teacher_courses (tenant_id, id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_courses_active_exact_period
      ON teacher_courses (tenant_id, teacher_id, course_id, effective_from, COALESCE(effective_to, 'infinity'::date))
      WHERE status = 'active' AND deleted_at IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE teacher_courses
      ADD CONSTRAINT ex_teacher_courses_active_period
      EXCLUDE USING gist (
        tenant_id WITH =,
        teacher_id WITH =,
        course_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
      )
      WHERE (status = 'active' AND deleted_at IS NULL)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_teacher_courses_read_port
      ON teacher_courses (tenant_id, course_id, teacher_id, status, effective_from, effective_to)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE teacher_courses DROP CONSTRAINT IF EXISTS ex_teacher_courses_active_period`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_teacher_courses_read_port`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_teacher_courses_active_exact_period`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_teacher_courses_tenant_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS teacher_courses`);
  }
}
