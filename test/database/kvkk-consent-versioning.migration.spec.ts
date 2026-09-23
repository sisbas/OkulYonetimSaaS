import { AddKvkkConsentVersioning1835000000000 } from '../../src/database/migrations/1835000000000-AddKvkkConsentVersioning';

/**
 * Migration smoke: KVKK consent sürümleme (#266 R5).
 * `src/database/migrations/` DIŞINDA tutulur (runner describe'ı migration sanmasın).
 * Gerçek PostgreSQL kanıtı CI DB Smoke'ta alınır (`test:database:required`).
 */
describe('AddKvkkConsentVersioning1835000000000 (#266 R5)', () => {
  const migration = new AddKvkkConsentVersioning1835000000000();
  const makeRunner = () => {
    const calls: string[] = [];
    return {
      calls,
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return undefined;
      }),
      hasTable: jest.fn(async () => true),
    } as unknown as import('typeorm').QueryRunner & { calls: string[] };
  };

  it('up() adds a version column with a positive-version guard and a governing index', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain(
      'ALTER TABLE "kvkk_consents" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1',
    );
    expect(all).toContain('chk_kvkk_consents_version_positive');
    expect(all).toContain('CHECK ("version" >= 1)');
    expect(all).toContain('CREATE INDEX IF NOT EXISTS "idx_kvkk_consents_governing"');
    expect(all).toContain('"version" DESC');
  });

  it('up() is idempotent: every DDL statement is guarded', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const statements = (runner as unknown as { calls: string[] }).calls;

    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      const guarded =
        statement.includes('IF NOT EXISTS') || statement.includes('IF EXISTS');
      expect(guarded).toBe(true);
    }
  });

  it('down() rolls the schema back idempotently', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('DROP INDEX IF EXISTS "idx_kvkk_consents_governing"');
    expect(all).toContain('DROP CONSTRAINT "chk_kvkk_consents_version_positive"');
    expect(all).toContain('ALTER TABLE "kvkk_consents" DROP COLUMN IF EXISTS "version"');
  });

  it('keeps the migration name stable for the typeorm migrations table', () => {
    expect(migration.name).toBe('AddKvkkConsentVersioning1835000000000');
  });
});
