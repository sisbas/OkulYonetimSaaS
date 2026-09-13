import { CreateAttendanceSessions1826000000000 } from '../../src/database/migrations/1826000000000-CreateAttendanceSessions';

/**
 * Migration smoke: attendance_sessions table create/down shape validation.
 * Kept OUT of src/database/migrations/ so TypeORM's migration runner does not
 * try to load it as a migration (describe is jest-only).
 */
describe('CreateAttendanceSessions1826000000000 (#265)', () => {
  const migration = new CreateAttendanceSessions1826000000000();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeRunner = () => {
    const calls: string[] = [];
    return {
      calls,
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return undefined;
      }),
      hasColumn: jest.fn(async () => false),
      hasTable: jest.fn(async () => false),
    } as unknown as import('typeorm').QueryRunner & { calls: string[] };
  };

  it('up() issues CREATE TABLE + indexes + FKs + CHECK', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');
    expect(all).toContain('CREATE TABLE IF NOT EXISTS "attendance_sessions"');
    expect(all).toContain('uq_attendance_sessions_tenant_event_date');
    // FKs are declared INLINE in CREATE TABLE (avoid ALTER ordering issues).
    expect(all).toContain('REFERENCES "schedule_events"("id") ON DELETE RESTRICT');
    expect(all).toContain('REFERENCES "courses"("id") ON DELETE RESTRICT');
    expect(all).toContain('REFERENCES "tenants"("id") ON DELETE RESTRICT');
    expect(all).toContain("CHECK (\"status\" IN ('draft', 'published', 'locked'))");
    expect(all).toContain('idx_attendance_sessions_tenant_teacher');
  });

  it('down() drops table + constraints', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');
    expect(all).toContain('DROP TABLE IF EXISTS "attendance_sessions"');
    expect(all).toContain('idx_attendance_sessions_tenant_teacher');
  });
});
