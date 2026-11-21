import { QueryRunner } from 'typeorm';

import { CreateScheduleMinimumPublish1784700000000 } from '../database/migrations/1784700000000-CreateScheduleMinimumPublish';
import { EnforcePublishedSchedulePeriod1930000000000 } from '../database/migrations/1930000000000-EnforcePublishedSchedulePeriod';

describe('CreateScheduleMinimumPublish migration', () => {
  it('creates the minimum Schedule publish family with non-null references and rollback', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (query: string) => { queries.push(query); }) } as unknown as QueryRunner;
    const migration = new CreateScheduleMinimumPublish1784700000000();

    await migration.up(runner);
    const sql = queries.join('\n');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS schedules');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS schedule_versions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS schedule_events');
    expect(sql).toContain('teacher_id uuid NOT NULL');
    expect(sql).toContain('teacher_branch_id uuid NOT NULL');
    expect(sql).toContain('student_group_id uuid NOT NULL');
    expect(sql).toContain('course_id uuid NOT NULL');
    expect(sql).toContain('room_id uuid NOT NULL');
    expect(sql).toContain('time_slot_id uuid NOT NULL');
    expect(sql).toContain('FOREIGN KEY (tenant_id, branch_id)');
    expect(sql).toContain('fk_schedule_events_time_slot_same_branch');
    expect(sql).toContain('time_slot_snapshot jsonb NOT NULL');
    expect(sql).toContain("to_regclass(current_schema() || '.teacher_branches')");
    expect(sql).not.toContain('solver');
    expect(sql).not.toContain('drag');
    expect(sql).not.toContain('leave_requests');

    queries.length = 0;
    await migration.down(runner);
    expect(queries).toEqual([
      'ALTER TABLE schedules DROP CONSTRAINT IF EXISTS fk_schedules_active_version',
      'DROP INDEX IF EXISTS idx_schedule_events_read_port',
      'DROP INDEX IF EXISTS uq_schedule_published_period',
      'DROP TABLE IF EXISTS schedule_events',
      'DROP TABLE IF EXISTS schedule_versions',
      'DROP TABLE IF EXISTS schedules',
    ]);
  });
});

describe('EnforcePublishedSchedulePeriod migration (#453)', () => {
  it('adds a btree_gist exclusion constraint for published periods with a reversible down', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (query: string) => { queries.push(query); }) } as unknown as QueryRunner;
    const migration = new EnforcePublishedSchedulePeriod1930000000000();

    await migration.up(runner);
    const sql = queries.join('\n');
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "btree_gist"');
    expect(sql).toContain('ex_schedules_published_period');
    expect(sql).toContain('EXCLUDE USING gist');
    expect(sql).toContain("daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&");
    expect(sql).toContain("WHERE (status = 'published')");

    queries.length = 0;
    await migration.down(runner);
    expect(queries).toEqual(['ALTER TABLE schedules DROP CONSTRAINT IF EXISTS ex_schedules_published_period']);
  });
});
