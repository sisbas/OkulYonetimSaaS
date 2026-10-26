import { CreateStrategicGoals1842000000000 } from '../../src/database/migrations/1842000000000-CreateStrategicGoals';

/**
 * Migration smoke: stratejik hedefler tablosu (#457).
 * `src/database/migrations/` DIŞINDA tutulur (runner describe'ı migration sanmasın).
 */
describe('CreateStrategicGoals1842000000000 (#457)', () => {
  const migration = new CreateStrategicGoals1842000000000();
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

  it('up() creates the goals table with the per-year-per-metric uniqueness guard', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('CREATE TABLE IF NOT EXISTS "strategic_goals"');
    expect(all).toContain('"tenant_id" uuid NOT NULL');
    expect(all).toContain('"academic_year" varchar(32) NOT NULL');
    expect(all).toContain('"metric_key" varchar(120) NOT NULL');
    expect(all).toContain('"metric_label" varchar(200) NULL');
    expect(all).toContain('"target_value" numeric(14, 4) NOT NULL');
    expect(all).toContain('"progress_value" numeric(14, 4) NULL');
    expect(all).toContain('"deleted_at" timestamptz NULL');
    expect(all).toContain(
      'CONSTRAINT "fk_strategic_goals_tenant"',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_strategic_goals_tenant_year_metric"',
    );
    // Tekillik KISMİ indeksle kurulur: yumuşak silinen hedef yeniden açılabilir.
    expect(all).toContain('WHERE "deleted_at" IS NULL');
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_strategic_goals_tenant_year"',
    );
  });

  it('down() drops indexes and the table idempotently', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('DROP INDEX IF EXISTS "idx_strategic_goals_tenant_year"');
    expect(all).toContain('DROP INDEX IF EXISTS "uq_strategic_goals_tenant_year_metric"');
    expect(all).toContain('DROP TABLE IF EXISTS "strategic_goals"');
  });
});
