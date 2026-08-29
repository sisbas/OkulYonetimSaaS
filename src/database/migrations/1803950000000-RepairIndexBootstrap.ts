import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #330 [P1B-12] — Repair-index bootstrap (Architecture A).
 *
 * Problem: 1804000000000-ParentOwnedScheduleSurfaces up() preflight RAISES
 * 'expected Schedule-owned repair index is missing' if the uq_schedule_repair_*
 * indexes are absent, but on a FRESH database nothing creates them before that
 * migration runs -> DB Smoke fails. Incremental DBs pass (false-green).
 *
 * Fix: this NEW migration (timestamp BEFORE 1804000000000 but AFTER every table
 * it indexes — 1784690000000 CreateStudentGroupReferenceFoundation is the latest
 * referenced table) creates the repair indexes idempotently so 1804000000000's
 * preflight finds them. 1804000000000 then DROPs them, leaving a clean final
 * schema (AC4).
 *
 * HARD RULE compliance:
 * - Does NOT modify merged 1804000000000 (RULE 5/6): separate migration.
 * - Adds no business capability (RULE 8): only bootstrap indexes.
 * - Mixes no Attendance/Notification/UX (RULE 9).
 *
 * AC7 guard: on an UPGRADED database where 1804000000000 already ran (and
 * dropped the repair indexes), re-running this migration would ORPHAN the repair
 * indexes (1804000000000 is already applied and will not drop them again).
 * Guard: if 1804000000000 is already in the migrations table, SKIP creation.
 */

interface IndexSurface {
  name: string;
  table: string;
  columns: readonly string[];
}

// Birebir kopya of REPAIR_INDEX_DEFINITIONS in 1804000000000 (single logical
// definition; kept local to avoid editing the merged migration per HARD RULE 5/6).
const REPAIR_INDEX_DEFINITIONS: ReadonlyArray<IndexSurface> = [
  { name: 'uq_schedule_repair_schedules_owner', table: 'schedules', columns: ['tenant_id', 'branch_id', 'id'] },
  { name: 'uq_schedule_repair_versions_owner', table: 'schedule_versions', columns: ['tenant_id', 'branch_id', 'schedule_id', 'id'] },
  { name: 'uq_schedule_repair_courses_tenant_id', table: 'courses', columns: ['tenant_id', 'id'] },
  { name: 'uq_schedule_repair_time_slots_branch_id', table: 'time_slots', columns: ['tenant_id', 'branch_id', 'id'] },
  { name: 'uq_schedule_repair_teachers_tenant_id', table: 'teachers', columns: ['tenant_id', 'id'] },
  { name: 'uq_schedule_repair_teacher_branches_owner', table: 'teacher_branches', columns: ['tenant_id', 'branch_id', 'teacher_id', 'id'] },
  { name: 'uq_schedule_repair_student_groups_branch_id', table: 'student_groups', columns: ['tenant_id', 'branch_id', 'id'] },
  { name: 'uq_schedule_repair_rooms_branch_id', table: 'rooms', columns: ['tenant_id', 'branch_id', 'id'] },
];

function indexDefinition(surface: IndexSurface): string {
  return `(${surface.columns.map((c) => `"${c}"`).join(', ')})`;
}

export class RepairIndexBootstrap1803950000000 implements MigrationInterface {
  name = 'RepairIndexBootstrap1803950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // AC7 guard: if 1804000000000 already applied, its preflight already passed
    // and it already DROPPED these indexes. Re-creating them here would orphan
    // them (1804000000000 will not run again). Skip to keep final schema clean.
    const applied = await queryRunner.query(
      `SELECT 1 FROM migrations WHERE name = 'ParentOwnedScheduleSurfaces1804000000000' LIMIT 1`,
    );
    if (applied.length > 0) {
      return;
    }
    for (const surface of REPAIR_INDEX_DEFINITIONS) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${surface.name} ${indexDefinition(surface)}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const surface of REPAIR_INDEX_DEFINITIONS) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${surface.name}`);
    }
  }
}
