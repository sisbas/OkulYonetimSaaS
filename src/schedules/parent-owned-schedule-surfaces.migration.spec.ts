import { QueryRunner } from 'typeorm';

import { ParentOwnedScheduleSurfaces1804000000000 } from '../database/migrations/1804000000000-ParentOwnedScheduleSurfaces';

describe('ParentOwnedScheduleSurfaces migration', () => {
  it('creates canonical parent indexes, re-points FKs and removes Schedule-owned repair indexes', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return undefined;
      }),
    } as unknown as QueryRunner;

    await new ParentOwnedScheduleSurfaces1804000000000().up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('Parent surface preflight failed: required table is missing');
    expect(sql).toContain('Parent surface preflight failed: a required canonical parent index is missing');
    expect(sql).toContain('Parent surface preflight failed: expected Schedule-owned repair index is missing');

    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_tenant_branch_id ON rooms (tenant_id, branch_id, id)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_tenant_branch_id ON time_slots (tenant_id, branch_id, id)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_schedules_tenant_branch_id ON schedules (tenant_id, branch_id, id)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_versions_tenant_branch_schedule_id ON schedule_versions (tenant_id, branch_id, schedule_id, id)');

    for (const repairIndex of [
      'uq_schedule_repair_schedules_owner',
      'uq_schedule_repair_versions_owner',
      'uq_schedule_repair_courses_tenant_id',
      'uq_schedule_repair_time_slots_branch_id',
      'uq_schedule_repair_teachers_tenant_id',
      'uq_schedule_repair_teacher_branches_owner',
      'uq_schedule_repair_student_groups_branch_id',
      'uq_schedule_repair_rooms_branch_id',
    ]) {
      expect(sql).toContain(`DROP INDEX IF EXISTS ${repairIndex}`);
      expect(sql).not.toContain(`CREATE UNIQUE INDEX IF NOT EXISTS ${repairIndex}`);
    }

    for (const fk of [
      'fk_schedule_events_schedule_owner',
      'fk_schedule_events_version_owner',
      'fk_schedule_events_course_tenant',
      'fk_schedule_events_time_slot_branch',
      'fk_schedule_events_teacher_tenant',
      'fk_schedule_events_teacher_branch_owner',
      'fk_schedule_events_student_group_branch',
      'fk_schedule_events_room_branch',
    ]) {
      expect(sql).toContain(`ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS ${fk}`);
    }
    expect(sql).toContain('ALTER TABLE schedules DROP CONSTRAINT IF EXISTS fk_schedules_active_version_owner');
    expect(sql).toContain('ALTER TABLE schedule_versions DROP CONSTRAINT IF EXISTS fk_schedule_versions_schedule_owner');

    expect(sql).toContain('Parent surface postcondition failed: canonical parent index is missing');
    expect(sql).toContain('Parent surface postcondition failed: Schedule-owned repair index remains');
    expect(sql).toContain('Parent surface postcondition failed: FK constraint count mismatch');

    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('CASCADE');
  });

  it('restores repair indexes and removes canonical parent indexes on rollback', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return undefined;
      }),
    } as unknown as QueryRunner;

    await new ParentOwnedScheduleSurfaces1804000000000().down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_schedules_owner ON schedules (tenant_id, branch_id, id)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_versions_owner ON schedule_versions (tenant_id, branch_id, schedule_id, id)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_courses_tenant_id ON courses (tenant_id, id)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_rooms_branch_id ON rooms (tenant_id, branch_id, id)');

    for (const canonicalIndex of [
      'uq_rooms_tenant_branch_id',
      'uq_time_slots_tenant_branch_id',
      'uq_schedules_tenant_branch_id',
      'uq_schedule_versions_tenant_branch_schedule_id',
    ]) {
      expect(sql).toContain(`DROP INDEX IF EXISTS ${canonicalIndex}`);
    }

    expect(sql).toContain('ADD CONSTRAINT fk_schedule_events_room_branch');
    expect(sql).toContain('ADD CONSTRAINT fk_schedule_versions_schedule_owner');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('CASCADE');
  });
});
