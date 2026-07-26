import { QueryRunner } from 'typeorm';

import { CreateIdentityTeacherReferenceFoundation1800000000000 } from '../database/migrations/1800000000000-CreateIdentityTeacherReferenceFoundation';

describe('CreateIdentityTeacherReferenceFoundation migration', () => {
  it('requires the Course-owned prerequisite and creates tenant-safe teacher reference tables', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new CreateIdentityTeacherReferenceFoundation1800000000000().up(queryRunner);
    const sql = queries.join('\n');

    expect(sql).toContain('required Course-owned uq_courses_tenant_id index is missing');
    expect(sql).not.toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_tenant_id');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS teachers');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS teacher_branches');
    expect(sql).toContain('fk_teacher_branches_teacher_same_tenant');
    expect(sql).toContain('FOREIGN KEY (tenant_id, teacher_id)');
    expect(sql).toContain('ex_teacher_branches_active_period');
    expect(sql).toContain('EXCLUDE USING gist');
    expect(sql).not.toContain('schedule_events');
    expect(sql).not.toContain('leave_requests');
    expect(sql).not.toContain('ON CONFLICT DO NOTHING');
  });

  it('drops only migration-owned teacher surfaces', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new CreateIdentityTeacherReferenceFoundation1800000000000().down(queryRunner);
    const sql = queries.join('\n');

    expect(sql).toContain('DROP TABLE IF EXISTS teacher_branches');
    expect(sql).toContain('DROP TABLE IF EXISTS teachers');
    expect(sql).not.toContain('DROP INDEX IF EXISTS uq_courses_tenant_id');
    expect(sql).not.toContain('CASCADE');
  });
});
