import { QueryRunner } from 'typeorm';

import { AddCourseTenantIdCompositeUnique1784577600000 } from '../database/migrations/1784577600000-AddCourseTenantIdCompositeUnique';

describe('AddCourseTenantIdCompositeUnique migration', () => {
  it('runs fail-closed preflight, creates the Course-owned index and verifies the postcondition', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return undefined;
      }),
    } as unknown as QueryRunner;

    await new AddCourseTenantIdCompositeUnique1784577600000().up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('Course prerequisite preflight failed: courses table is missing');
    expect(sql).toContain('null or orphan tenant reference detected');
    expect(sql).toContain('duplicate (tenant_id, id) rows detected');
    expect(sql).toContain('uq_courses_tenant_id exists with an invalid definition');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_tenant_id');
    expect(sql).toContain('ON courses (tenant_id, id)');
    expect(sql).toContain('Course prerequisite postcondition failed');

    expect(sql).not.toContain('CREATE TABLE teacher');
    expect(sql).not.toContain('CREATE TABLE schedule');
    expect(sql).not.toContain('ALTER TABLE teacher_courses');
    expect(sql).not.toContain('ALTER TABLE schedule_events');
  });

  it('drops only the Course-owned index and blocks rollback when child constraints depend on it', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return undefined;
      }),
    } as unknown as QueryRunner;

    await new AddCourseTenantIdCompositeUnique1784577600000().down(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('Course prerequisite rollback blocked');
    expect(sql).toContain('DROP INDEX IF EXISTS uq_courses_tenant_id');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('DROP INDEX IF EXISTS uq_branches_tenant_id');
    expect(sql).not.toContain('CASCADE');
  });
});
