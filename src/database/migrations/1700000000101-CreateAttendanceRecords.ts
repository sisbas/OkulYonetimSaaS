import { MigrationInterface, QueryRunner } from 'typeorm';

// OKUL-06: Ders bazlı yoklama kayıt tablosu.
export class CreateAttendanceRecords1700000000101 implements MigrationInterface {
  name = 'CreateAttendanceRecords1700000000101';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "session_date" date NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'absent',
        "marked_by_id" uuid,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_attendance_tenant_student" ON "attendance_records" ("tenant_id", "student_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_attendance_tenant_course_date" ON "attendance_records" ("tenant_id", "course_id", "session_date")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_attendance_tenant_student_course_date" ON "attendance_records" ("tenant_id", "student_id", "course_id", "session_date")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_records"`);
  }
}
