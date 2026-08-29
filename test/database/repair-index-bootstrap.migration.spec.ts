import { RepairIndexBootstrap1803990000000 } from '../../src/database/migrations/1803990000000-RepairIndexBootstrap';

/**
 * Unit-level logic test for the repair-index bootstrap migration (#330).
 * Uses a fake queryRunner to assert SQL generation and the AC7 guard without
 * a real database. Fresh-DB determinism and final-schema assertions are covered
 * by CI DB Smoke (fresh + upgraded scenarios).
 */
describe('RepairIndexBootstrap1803990000000 (#330)', () => {
  function fakeRunner(initialMigrations: string[] = []) {
    const created: string[] = [];
    const dropped: string[] = [];
    const queries: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('FROM migrations WHERE name')) {
          return initialMigrations.length ? [{ '?column?': 1 }] : [];
        }
        if (sql.startsWith('CREATE UNIQUE INDEX')) {
          created.push(sql);
        }
        if (sql.startsWith('DROP INDEX')) {
          dropped.push(sql);
        }
        return undefined;
      }),
    } as unknown as import('typeorm').QueryRunner & {
      created: string[];
      dropped: string[];
      queries: string[];
    };
    (runner as unknown as { created: string[] }).created = created;
    (runner as unknown as { dropped: string[] }).dropped = dropped;
    (runner as unknown as { queries: string[] }).queries = queries;
    return runner;
  }

  it('up() creates all 8 repair indexes when 180400 not yet applied (fresh DB)', async () => {
    const runner = fakeRunner();
    await new RepairIndexBootstrap1803990000000().up(runner);
    expect(runner.created.length).toBe(8);
    expect(runner.created.every((s) => s.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_repair_'))).toBe(true);
    expect(runner.dropped.length).toBe(0);
  });

  it('up() SKIPs creation when 180400 already applied (AC7 guard, upgraded DB)', async () => {
    const runner = fakeRunner(['ParentOwnedScheduleSurfaces1804000000000']);
    await new RepairIndexBootstrap1803990000000().up(runner);
    expect(runner.created.length).toBe(0);
    expect(runner.dropped.length).toBe(0);
  });

  it('down() drops all 8 repair indexes', async () => {
    const runner = fakeRunner();
    await new RepairIndexBootstrap1803990000000().down(runner);
    expect(runner.dropped.length).toBe(8);
    expect(runner.dropped.every((s) => s.includes('DROP INDEX IF EXISTS uq_schedule_repair_'))).toBe(true);
  });
});
