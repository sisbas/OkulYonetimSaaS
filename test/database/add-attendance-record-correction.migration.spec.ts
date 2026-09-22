import { AddAttendanceRecordCorrection1826000000000 } from '../../src/database/migrations/1826000000000-AddAttendanceRecordCorrection';

/**
 * Migration smoke: kontrollü düzeltme kolonları (AC-4, #265).
 * `src/database/migrations/` DIŞINDA tutulur; TypeORM runner describe'ı
 * migration sanmasın (create-attendance-sessions.migration.spec.ts ile aynı desen).
 */
describe('AddAttendanceRecordCorrection1826000000000 (#265 AC-4)', () => {
  const migration = new AddAttendanceRecordCorrection1826000000000();
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
    } as unknown as import('typeorm').QueryRunner & { calls: string[] };
  };

  it('up() adds the correction columns idempotently and locks the reason vocabulary in a CHECK', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain(
      'ADD COLUMN IF NOT EXISTS "correction_reason_code" varchar(40)',
    );
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "corrected_by_id" uuid');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "corrected_at" timestamptz');
    expect(all).toContain(
      'ADD COLUMN IF NOT EXISTS "correction_count" integer NOT NULL DEFAULT 0',
    );
    expect(all).toContain('DROP CONSTRAINT IF EXISTS "chk_attendance_records_correction_reason_code"');
    expect(all).toContain("CHECK (\"correction_reason_code\" IS NULL OR \"correction_reason_code\" IN ('mis_selection', 'late_arrival_update', 'excused_document', 'manager_review'))");
  });

  it('up() is re-runnable (no bare ADD COLUMN / no unguarded CHECK)', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const calls = (runner as unknown as { calls: string[] }).calls;
    const addColumns = calls.filter((sql) => sql.includes('ADD COLUMN'));
    expect(addColumns.length).toBeGreaterThan(0);
    for (const sql of addColumns) {
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    }
  });

  it('down() drops the constraint and all four columns idempotently', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('DROP CONSTRAINT IF EXISTS "chk_attendance_records_correction_reason_code"');
    expect(all).toContain('DROP COLUMN IF EXISTS "correction_count"');
    expect(all).toContain('DROP COLUMN IF EXISTS "corrected_at"');
    expect(all).toContain('DROP COLUMN IF EXISTS "corrected_by_id"');
    expect(all).toContain('DROP COLUMN IF EXISTS "correction_reason_code"');
  });
});
