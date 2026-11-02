import { CreateStudentGroupMembers1890000000000 } from '../../src/database/migrations/1890000000000-CreateStudentGroupMembers';

/**
 * Migration smoke: #461 F1 öğrenci–grup üyeliği foundation.
 * `src/database/migrations/` DIŞINDA tutulur (TypeORM runner migration
 * sanmasın).
 */
describe('CreateStudentGroupMembers1890000000000 (#461 F1)', () => {
  const migration = new CreateStudentGroupMembers1890000000000();
  const makeRunner = () => {
    const calls: string[] = [];
    return {
      calls,
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return undefined;
      }),
      hasTable: jest.fn(async () => false),
    } as unknown as import('typeorm').QueryRunner & { calls: string[] };
  };

  const normalizedUpSql = async (): Promise<string> => {
    const runner = makeRunner();
    await migration.up(runner as never);
    return (runner as unknown as { calls: string[] }).calls
      .join('\n')
      .replace(/\s+/g, ' ');
  };

  it('adds the branch-consistent students unique index required by the composite FK', async () => {
    const all = await normalizedUpSql();
    expect(all).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_students_branch_id" ON "students" ("tenant_id", "branch_id", "id")',
    );
  });

  it('creates student_group_members with same-tenant and same-branch composite FKs', async () => {
    const all = await normalizedUpSql();

    expect(all).toContain('CREATE TABLE IF NOT EXISTS "student_group_members"');
    expect(all).toContain('"student_group_id" uuid NOT NULL');
    expect(all).toContain('"student_id" uuid NOT NULL');
    expect(all).toContain(
      'FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id")',
    );
    expect(all).toContain(
      'FOREIGN KEY ("tenant_id", "branch_id", "student_group_id") REFERENCES "student_groups"("tenant_id", "branch_id", "id")',
    );
    expect(all).toContain(
      'FOREIGN KEY ("tenant_id", "branch_id", "student_id") REFERENCES "students"("tenant_id", "branch_id", "id")',
    );
    expect(all).toContain(
      "CHECK (\"status\" IN ('active', 'inactive'))",
    );
  });

  it('allows one active membership per group/student and excludes soft-deleted rows', async () => {
    const all = await normalizedUpSql();
    expect(all).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_group_members_active" ON "student_group_members" ("tenant_id", "student_group_id", "student_id") WHERE "deleted_at" IS NULL',
    );
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_student_group_members_tenant_group_status"',
    );
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_student_group_members_tenant_student"',
    );
  });

  it('down() drops the membership table before the supporting students index (idempotent)', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls
      .join('\n')
      .replace(/\s+/g, ' ');

    expect(all).toContain('DROP TABLE IF EXISTS "student_group_members"');
    expect(all).toContain('DROP INDEX IF EXISTS "uq_students_branch_id"');
    expect(all.indexOf('DROP TABLE IF EXISTS "student_group_members"')).toBeLessThan(
      all.indexOf('DROP INDEX IF EXISTS "uq_students_branch_id"'),
    );
  });
});
