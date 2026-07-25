import { QueryRunner } from 'typeorm';

import { CreateIdentityTeacherReferenceFoundation1785000000000 } from '../database/migrations/1785000000000-CreateIdentityTeacherReferenceFoundation';

describe('CreateIdentityTeacherReferenceFoundation migration', () => {
  it('adds Course-owned prerequisite and teacher reference tables without Schedule or Leave scope', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (sql: string) => { queries.push(sql); }) } as unknown as QueryRunner;
    await new CreateIdentityTeacherReferenceFoundation1785000000000().up(queryRunner);
    const sql = queries.join('\n');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_tenant_id');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS teachers');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS teacher_branches');
    expect(sql).toContain('uq_teacher_branches_active_membership');
    expect(sql).not.toContain('schedule_events');
    expect(sql).not.toContain('leave_requests');
    expect(sql).not.toContain('ON CONFLICT DO NOTHING');
  });

  it('drops only owned surfaces and blocks unsafe Course prerequisite rollback', async () => {
    const queries: string[] = [];
    const queryRunner = { query: jest.fn(async (sql: string) => { queries.push(sql); }) } as unknown as QueryRunner;
    await new CreateIdentityTeacherReferenceFoundation1785000000000().down(queryRunner);
    const sql = queries.join('\n');
    expect(sql).toContain('DROP TABLE IF EXISTS teacher_branches');
    expect(sql).toContain('DROP TABLE IF EXISTS teachers');
    expect(sql).toContain('Identity teacher foundation rollback blocked');
    expect(sql).toContain('DROP INDEX IF EXISTS uq_courses_tenant_id');
    expect(sql).not.toContain('CASCADE');
  });
});
