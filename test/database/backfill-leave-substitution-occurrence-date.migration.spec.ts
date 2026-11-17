import { BackfillLeaveSubstitutionOccurrenceDate1910000000000 } from '../../src/database/migrations/1910000000000-BackfillLeaveSubstitutionOccurrenceDate';

/**
 * Migration smoke: eski NULL occurrence_date satırlarının backfill şekli.
 * Kept OUT of src/database/migrations/ so the migration runner never loads
 * this jest-only spec.
 */
describe('BackfillLeaveSubstitutionOccurrenceDate1910000000000 (#461 F4)', () => {
  const migration = new BackfillLeaveSubstitutionOccurrenceDate1910000000000();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeRunner = () => {
    const calls: string[] = [];
    return {
      calls,
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return undefined;
      }),
    } as unknown as import('typeorm').QueryRunner & { calls: string[] };
  };

  it('up() backfills NULL rows only from a single unambiguous linked lesson date', async () => {
    const runner = makeRunner();

    await migration.up(runner);

    expect(runner.calls).toHaveLength(1);
    const sql = runner.calls[0];
    expect(sql).toContain('UPDATE leave_substitution_assignments');
    expect(sql).toContain('assignment.occurrence_date IS NULL');
    expect(sql).toContain('substitute_assignment_id');
    expect(sql).toContain('MIN(lesson.occurrence_date)');
    expect(sql).toContain('COUNT(DISTINCT lesson.occurrence_date) = 1');
  });

  it('up() never rewrites rows that already carry a date', async () => {
    const runner = makeRunner();

    await migration.up(runner);

    const sql = runner.calls[0];
    expect(sql).not.toMatch(/SET occurrence_date = NULL/i);
    // Tarihli satırlara dokunmama garantisi: WHERE occurrence_date IS NULL.
    expect(sql).toMatch(/WHERE assignment\.occurrence_date IS NULL/i);
  });

  it('up() is re-runnable (idempotent guard on occurrence_date IS NULL)', async () => {
    const first = makeRunner();
    const second = makeRunner();

    await migration.up(first);
    await migration.up(second);

    // İkinci çalışma aynı koşulu taşır: NULL kalmayan satır tekrar yazılmaz.
    expect(second.calls[0]).toBe(first.calls[0]);
    expect(second.calls[0]).toContain('IS NULL');
  });

  it('down() is a documented no-op — a data backfill is not reversible', async () => {
    const runner = makeRunner();

    await migration.down(runner);

    expect(runner.calls).toHaveLength(0);
  });
});
