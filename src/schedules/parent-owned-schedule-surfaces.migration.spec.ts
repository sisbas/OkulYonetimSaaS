import { QueryRunner } from 'typeorm';

import { ParentOwnedScheduleSurfaces1804000000000 } from '../database/migrations/1804000000000-ParentOwnedScheduleSurfaces';

const EXPECTED_FKS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['schedule_versions', 'fk_schedule_versions_schedule_owner', '(tenant_id, branch_id, schedule_id)', 'schedules (tenant_id, branch_id, id)'],
  ['schedule_events', 'fk_schedule_events_schedule_owner', '(tenant_id, branch_id, schedule_id)', 'schedules (tenant_id, branch_id, id)'],
  ['schedules', 'fk_schedules_active_version_owner', '(tenant_id, branch_id, id, active_version_id)', 'schedule_versions (tenant_id, branch_id, schedule_id, id)'],
  ['schedule_events', 'fk_schedule_events_version_owner', '(tenant_id, branch_id, schedule_id, version_id)', 'schedule_versions (tenant_id, branch_id, schedule_id, id)'],
  ['schedule_events', 'fk_schedule_events_course_tenant', '(tenant_id, course_id)', 'courses (tenant_id, id)'],
  ['schedule_events', 'fk_schedule_events_time_slot_branch', '(tenant_id, branch_id, time_slot_id)', 'time_slots (tenant_id, branch_id, id)'],
  ['schedule_events', 'fk_schedule_events_teacher_tenant', '(tenant_id, teacher_id)', 'teachers (tenant_id, id)'],
  ['schedule_events', 'fk_schedule_events_teacher_branch_owner', '(tenant_id, branch_id, teacher_id, teacher_branch_id)', 'teacher_branches (tenant_id, branch_id, teacher_id, id)'],
  ['schedule_events', 'fk_schedule_events_student_group_branch', '(tenant_id, branch_id, student_group_id)', 'student_groups (tenant_id, branch_id, id)'],
  ['schedule_events', 'fk_schedule_events_room_branch', '(tenant_id, branch_id, room_id)', 'rooms (tenant_id, branch_id, id)'],
];

const EXPECTED_CANONICAL_INDEXES: ReadonlyArray<readonly [string, string, string]> = [
  ['uq_rooms_tenant_branch_id', 'rooms', '(tenant_id, branch_id, id)'],
  ['uq_time_slots_tenant_branch_id', 'time_slots', '(tenant_id, branch_id, id)'],
  ['uq_schedules_tenant_branch_id', 'schedules', '(tenant_id, branch_id, id)'],
  ['uq_schedule_versions_tenant_branch_schedule_id', 'schedule_versions', '(tenant_id, branch_id, schedule_id, id)'],
];

const EXPECTED_REPAIR_INDEXES: ReadonlyArray<readonly [string, string, string]> = [
  ['uq_schedule_repair_schedules_owner', 'schedules', '(tenant_id, branch_id, id)'],
  ['uq_schedule_repair_versions_owner', 'schedule_versions', '(tenant_id, branch_id, schedule_id, id)'],
  ['uq_schedule_repair_courses_tenant_id', 'courses', '(tenant_id, id)'],
  ['uq_schedule_repair_time_slots_branch_id', 'time_slots', '(tenant_id, branch_id, id)'],
  ['uq_schedule_repair_teachers_tenant_id', 'teachers', '(tenant_id, id)'],
  ['uq_schedule_repair_teacher_branches_owner', 'teacher_branches', '(tenant_id, branch_id, teacher_id, id)'],
  ['uq_schedule_repair_student_groups_branch_id', 'student_groups', '(tenant_id, branch_id, id)'],
  ['uq_schedule_repair_rooms_branch_id', 'rooms', '(tenant_id, branch_id, id)'],
];

function fakeQueryRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = [];
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return undefined;
    }),
  } as unknown as QueryRunner;
  return { runner, queries };
}

function assertAllFkConstraints(sql: string): void {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  for (const [table, name, columns, references] of EXPECTED_FKS) {
    expect(normalized).toContain(
      `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY ${columns} REFERENCES ${references} ON DELETE RESTRICT`,
    );
  }
}

function assertFkDrops(sql: string): void {
  for (const [table, name] of EXPECTED_FKS) {
    expect(sql).toContain(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
  }
}

describe('ParentOwnedScheduleSurfaces migration', () => {
  it('preflights fail-closed and re-points FKs onto canonical parent surfaces', async () => {
    const { runner, queries } = fakeQueryRunner();
    await new ParentOwnedScheduleSurfaces1804000000000().up(runner);

    const sql = queries.join('\n');
    expect(sql).toContain('Parent surface preflight failed: required table is missing');
    expect(sql).toContain('Parent surface preflight failed: a required canonical parent index is missing');
    expect(sql).toContain('Parent surface preflight failed: uq_courses_tenant_id exists with an invalid definition');
    expect(sql).toContain('Parent surface preflight failed: expected Schedule-owned repair index is missing');
    expect(sql).toContain('Parent surface preflight failed: uq_schedule_repair_rooms_branch_id exists with an invalid definition');
    expect(sql).toContain(
      "Parent surface preflight failed: uq_rooms_tenant_branch_id already exists; canonical ownership cannot be claimed (rollback would drop a pre-existing surface)",
    );

    for (const [name, table, columns] of EXPECTED_CANONICAL_INDEXES) {
      expect(sql).toContain(`CREATE UNIQUE INDEX ${name} ON ${table} ${columns}`);
    }

    for (const [name, table, columns] of EXPECTED_REPAIR_INDEXES) {
      expect(sql).toContain(`DROP INDEX IF EXISTS ${name}`);
      expect(sql).not.toContain(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${table} ${columns}`);
    }

    assertFkDrops(sql);
    assertAllFkConstraints(sql);

    expect(sql).toContain('Parent surface postcondition failed: canonical parent index is missing or invalid');
    expect(sql).toContain('Parent surface postcondition failed: Schedule-owned repair index remains');
    expect(sql).toContain('Parent surface postcondition failed: FK contract mismatch');

    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('CASCADE');
  });

  it('restores repair indexes and removes canonical parent indexes on rollback', async () => {
    const { runner, queries } = fakeQueryRunner();
    await new ParentOwnedScheduleSurfaces1804000000000().down(runner);

    const sql = queries.join('\n');
    for (const [name, table, columns] of EXPECTED_REPAIR_INDEXES) {
      expect(sql).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${table} ${columns}`);
    }

    for (const [name] of EXPECTED_CANONICAL_INDEXES) {
      expect(sql).toContain(`DROP INDEX IF EXISTS ${name}`);
    }

    expect(sql).toContain('Parent surface rollback failed: repair index missing or invalid');
    assertAllFkConstraints(sql);

    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('CASCADE');
  });
});
