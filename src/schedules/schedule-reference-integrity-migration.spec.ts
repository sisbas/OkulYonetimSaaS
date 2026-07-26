import { QueryRunner } from 'typeorm';

import { EnforceScheduleReferenceIntegrity1801000000000 } from '../database/migrations/1801000000000-EnforceScheduleReferenceIntegrity';

function mockRunner(queries: string[]): QueryRunner {
  return { query: jest.fn(async (query: string) => { queries.push(query); }) } as unknown as QueryRunner;
}

describe('EnforceScheduleReferenceIntegrity migration', () => {
  it('preflights invalid rows and enforces tenant/branch ownership without repair, delete or cascade', async () => {
    const queries: string[] = [];
    await new EnforceScheduleReferenceIntegrity1801000000000().up(mockRunner(queries));
    const sql = queries.join('\n');

    expect(sql).toContain('WP07_SCHEDULE_REPAIR_REQUIRES_ISSUE_141_TEACHERS_TABLE');
    expect(sql).toContain('WP07_SCHEDULE_REPAIR_REQUIRES_ISSUE_141_TEACHER_BRANCHES_TABLE');
    expect(sql).toContain('WP07_SCHEDULE_REPAIR_REQUIRES_ROOMS_TABLE');
    expect(sql).toContain('WP07_SCHEDULE_REFERENCE_PREFLIGHT_HOLD');
    expect(sql).toContain('active_version owner mismatch');
    expect(sql).toContain('course tenant mismatch');
    expect(sql).toContain('time_slot owner mismatch');
    expect(sql).toContain('teacher tenant mismatch');
    expect(sql).toContain('teacher_branch ownership mismatch');
    expect(sql).toContain('student_group owner mismatch');
    expect(sql).toContain('room owner mismatch');

    expect(sql).toContain('fk_schedule_events_course_tenant');
    expect(sql).toContain('FOREIGN KEY (tenant_id, course_id)');
    expect(sql).toContain('fk_schedule_events_time_slot_branch');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id, time_slot_id)');
    expect(sql).toContain('fk_schedule_events_teacher_tenant');
    expect(sql).toContain('FOREIGN KEY (tenant_id, teacher_id)');
    expect(sql).toContain('fk_schedule_events_teacher_branch_owner');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id, teacher_id, teacher_branch_id)');
    expect(sql).toContain('fk_schedule_events_student_group_branch');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id, student_group_id)');
    expect(sql).toContain('fk_schedule_events_room_branch');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id, room_id)');
    expect(sql).toContain('fk_schedules_active_version_owner');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id, id, active_version_id)');

    expect(sql).toContain('schedule_repair_prevent_published_snapshot_mutation');
    expect(sql).toContain('OLD.published_at IS NOT NULL');
    expect(sql).toContain('WP07_SCHEDULE_PUBLISHED_SNAPSHOT_IMMUTABLE');
    expect(sql).not.toContain("OLD.status = 'published'");
    expect(sql).not.toContain('CASCADE');
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE\s+(schedule_events|schedule_versions|schedules)/i);
  });

  it('reverts only the follow-up constraint, trigger and index family', async () => {
    const queries: string[] = [];
    const migration = new EnforceScheduleReferenceIntegrity1801000000000();
    await migration.up(mockRunner(queries));
    queries.length = 0;

    await migration.down(mockRunner(queries));

    expect(queries).toEqual([
      'DROP TRIGGER IF EXISTS trg_schedule_repair_published_snapshot_immutable ON schedule_versions',
      'DROP FUNCTION IF EXISTS schedule_repair_prevent_published_snapshot_mutation',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_room_branch',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_student_group_branch',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_teacher_branch_owner',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_teacher_tenant',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_time_slot_branch',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_course_tenant',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_version_owner',
      'ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS fk_schedule_events_schedule_owner',
      'ALTER TABLE schedules DROP CONSTRAINT IF EXISTS fk_schedules_active_version_owner',
      'ALTER TABLE schedule_versions DROP CONSTRAINT IF EXISTS fk_schedule_versions_schedule_owner',
      'DROP INDEX IF EXISTS uq_schedule_repair_rooms_branch_id',
      'DROP INDEX IF EXISTS uq_schedule_repair_student_groups_branch_id',
      'DROP INDEX IF EXISTS uq_schedule_repair_teacher_branches_owner',
      'DROP INDEX IF EXISTS uq_schedule_repair_teachers_tenant_id',
      'DROP INDEX IF EXISTS uq_schedule_repair_time_slots_branch_id',
      'DROP INDEX IF EXISTS uq_schedule_repair_courses_tenant_id',
      'DROP INDEX IF EXISTS uq_schedule_repair_versions_owner',
      'DROP INDEX IF EXISTS uq_schedule_repair_schedules_owner',
    ]);
    expect(queries.join('\n')).not.toContain('DROP TABLE');
    expect(queries.join('\n')).not.toContain('DROP SCHEMA');
  });

  it('supports the migrate, revert and remigrate command cycle at the migration level', async () => {
    const queries: string[] = [];
    const migration = new EnforceScheduleReferenceIntegrity1801000000000();
    const runner = mockRunner(queries);

    await migration.up(runner);
    const firstUpCount = queries.length;
    await migration.down(runner);
    const afterDownCount = queries.length;
    await migration.up(runner);

    expect(firstUpCount).toBeGreaterThan(0);
    expect(afterDownCount).toBeGreaterThan(firstUpCount);
    expect(queries.length).toBeGreaterThan(afterDownCount);
  });
});
