import { QueryRunner } from 'typeorm';

import { CreateTeacherCourseEligibility1803000000000 } from '../database/migrations/1803000000000-CreateTeacherCourseEligibility';

describe('CreateTeacherCourseEligibility migration', () => {
  it('creates only the teacher_courses owned table, constraints and read-port index', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (sql: string) => queries.push(sql)) } as unknown as QueryRunner;

    await new CreateTeacherCourseEligibility1803000000000().up(queryRunner);
    const sql = queries.join('\n');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS teacher_courses');
    expect(sql).toContain('REFERENCES teachers(tenant_id, id)');
    expect(sql).toContain('REFERENCES courses(tenant_id, id)');
    expect(sql).toContain('ex_teacher_courses_active_period');
    expect(sql).toContain('uq_teacher_courses_active_exact_period');
    expect(sql).toContain('idx_teacher_courses_read_port');
    expect(sql).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_tenant_id');
    expect(sql).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_tenant_id');
    expect(sql).not.toContain('schedule_events');
    expect(sql).not.toContain('leave_requests');
    expect(sql).not.toContain('ON CONFLICT DO NOTHING');
  });

  it('drops only teacher_courses owned surfaces without touching parent indexes', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (sql: string) => queries.push(sql)) } as unknown as QueryRunner;

    await new CreateTeacherCourseEligibility1803000000000().down(queryRunner);
    const sql = queries.join('\n');

    expect(sql).toContain('DROP TABLE IF EXISTS teacher_courses');
    expect(sql).toContain('DROP INDEX IF EXISTS uq_teacher_courses_tenant_id');
    expect(sql).not.toContain('DROP INDEX IF EXISTS uq_courses_tenant_id');
    expect(sql).not.toContain('DROP INDEX IF EXISTS uq_teachers_tenant_id');
    expect(sql).not.toContain('CASCADE');
  });
});
