import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #261 [P1B-03][DATA] — Reconcile attendance_records to canonical session_id schema.
 *
 * Two prior MERGED (immutable) migrations both issued
 * `CREATE TABLE IF NOT EXISTS attendance_records` with DIVERGENT schemas:
 *   - 1700000000101 (course_id, status default 'absent')
 *   - 1810000000000 (session_id, status default 'present', + attendance_sessions)
 * Because both use IF NOT EXISTS, only the first-to-run wins and the table schema
 * is deploy-order-dependent (P0-2, confirmed live).
 *
 * Decision Record M5 authority chain: ScheduleEvent -> AttendanceSession ->
 * AttendanceRecord. Canonical key is session_id (owner-approved, Loop 2 / option Y).
 *
 * This FOLLOW-UP migration (immutable rule §6: never edits merged migrations)
 * reconciles the live table to the canonical session_id schema WITHOUT dropping
 * data:
 *   1. Drops legacy course_id-based unique/index if present.
 *   2. Adds session_id (nullable) + FK to attendance_sessions.
 *   3. Backfills session_id from course_id + session_date via attendance_sessions
 *      match (course_id -> attendance_sessions.course_id, same tenant + date).
 *   4. Makes session_id NOT NULL after backfill; drops legacy course_id column.
 *   5. Adds canonical UNIQUE (tenant_id, session_id, student_id) + CHECK status
 *      + tenant predicates (named).
 *   6. Removes `status DEFAULT 'absent'` (Decision Record §M5: default-absent model
 *      removed from domain lifecycle).
 *
 * NOTE: timestamp 1825000000000 chosen to avoid collision with existing
 * 1820000000000-CreateNotificationLogs (duplicate-timestamp risk per #261).
 */
export class ReconcileAttendanceRecordsToSessionSchema1825000000000
  implements MigrationInterface
{
  name = 'ReconcileAttendanceRecordsToSessionSchema1825000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. drop legacy course_id unique/index if they exist
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_attendance_tenant_student_course_date"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_attendance_tenant_course_date"`);

    // 2. add session_id + FK to attendance_sessions
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "session_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD CONSTRAINT "fk_attendance_records_session"
        FOREIGN KEY ("tenant_id", "session_id")
        REFERENCES "attendance_sessions"("tenant_id", "id") ON DELETE RESTRICT`,
    );

    // 3. backfill session_id from course_id + session_date (best-match session).
    //    PostgreSQL does not allow LIMIT in UPDATE ... FROM, so use a correlated
    //    scalar subquery (LIMIT is valid inside the SELECT).
    await queryRunner.query(`
      UPDATE "attendance_records" ar
      SET "session_id" = (
        SELECT s."id"
        FROM "attendance_sessions" s
        WHERE s."tenant_id" = ar."tenant_id"
          AND s."course_id" = ar."course_id"
          AND s."session_date" = ar."session_date"
        ORDER BY s."created_at" ASC
        LIMIT 1
      )
      WHERE ar."session_id" IS NULL
        AND ar."course_id" IS NOT NULL
    `);

    // 4. enforce NOT NULL on session_id, drop legacy course_id
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ALTER COLUMN "session_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "course_id"`,
    );

    // 5. canonical unique + check + tenant predicates
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_attendance_records_tenant_session_student"
        ON "attendance_records" ("tenant_id", "session_id", "student_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP CONSTRAINT IF EXISTS "chk_attendance_records_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD CONSTRAINT "chk_attendance_records_status"
        CHECK ("status" IN ('present', 'absent', 'late', 'excused'))`,
    );

    // 6. remove default 'absent' (§M5)
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ALTER COLUMN "status" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // best-effort revert: restore course_id column (no historical value retained)
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "course_id" uuid`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_attendance_records_tenant_session_student"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP CONSTRAINT IF EXISTS "fk_attendance_records_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "session_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_records" ALTER COLUMN "status" SET DEFAULT 'absent'`,
    );
  }
}
