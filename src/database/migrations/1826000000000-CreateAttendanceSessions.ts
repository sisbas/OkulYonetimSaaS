import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #265 [P1B-08][ATTENDANCE] — Create attendance_sessions table.
 *
 * M5 authority chain: ScheduleEvent -> AttendanceSession -> AttendanceRecord.
 * The attendance_records table already references attendance_sessions via FK
 * (migration 1825000000000-ReconcileAttendanceRecordsToSessionSchema) but the
 * session table itself was never created by an immutable migration. This
 * FOLLOW-UP migration (immutable rule §6) creates it with canonical schema:
 *
 *   - tenant-scoped, UNIQUE(tenant_id, schedule_event_id, session_date)
 *   - FK -> schedule_events (tenant + id), students (tenant + id)
 *   - roster_snapshot jsonb (immutable student-id list)
 *   - status draft/published/locked + version (optimistic concurrency)
 *
 * NOTE: timestamp 1826000000000 chosen to be strictly after 1825000000000.
 */
export class CreateAttendanceSessions1826000000000
  implements MigrationInterface
{
  name = 'CreateAttendanceSessions1826000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "schedule_event_id" uuid NOT NULL,
        "teacher_id" uuid NOT NULL,
        "student_group_id" uuid,
        "course_id" uuid NOT NULL,
        "room_id" uuid,
        "session_date" date NOT NULL,
        "roster_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(16) NOT NULL DEFAULT 'published',
        "version" integer NOT NULL DEFAULT 1,
        "locked_by_id" uuid,
        "locked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_attendance_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_attendance_sessions_tenant_event_date"
        ON "attendance_sessions" ("tenant_id", "schedule_event_id", "session_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_attendance_sessions_tenant_teacher"
        ON "attendance_sessions" ("tenant_id", "teacher_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "attendance_sessions"
        ADD CONSTRAINT "fk_attendance_sessions_tenant"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_sessions"
        ADD CONSTRAINT "fk_attendance_sessions_event"
        FOREIGN KEY ("tenant_id", "schedule_event_id")
        REFERENCES "schedule_events"("tenant_id", "id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_sessions"
        ADD CONSTRAINT "fk_attendance_sessions_course"
        FOREIGN KEY ("tenant_id", "course_id")
        REFERENCES "courses"("tenant_id", "id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_sessions"
        ADD CONSTRAINT "chk_attendance_sessions_status"
        CHECK ("status" IN ('draft', 'published', 'locked'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "fk_attendance_sessions_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "fk_attendance_sessions_event"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "fk_attendance_sessions_course"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "chk_attendance_sessions_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_attendance_sessions_tenant_event_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_attendance_sessions_tenant_teacher"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_sessions"`);
  }
}
