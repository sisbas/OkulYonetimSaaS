import { CreateCoursesTable20260714095100 } from '../database/migrations/20260714095100-CreateCoursesTable';

describe('CreateCoursesTable migration', () => {
  it('creates and reverts the courses table', async () => {
    const migration = new CreateCoursesTable20260714095100();
    const queryRunner = { query: jest.fn(async () => undefined) } as any;

    await migration.up(queryRunner);
    expect(queryRunner.query.mock.calls.map(([sql]: [string]) => sql).join('\n')).toContain('CREATE TABLE IF NOT EXISTS courses');
    expect(queryRunner.query.mock.calls.map(([sql]: [string]) => sql).join('\n')).toContain('uq_courses_tenant_code');

    queryRunner.query.mockClear();
    await migration.down(queryRunner);
    expect(queryRunner.query.mock.calls.map(([sql]: [string]) => sql).join('\n')).toContain('DROP TABLE IF EXISTS courses');
  });
});
