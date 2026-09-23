import { AddAuditLogChain1827000000000 } from '../../src/database/migrations/1827000000000-AddAuditLogChain';

/**
 * Migration smoke: audit zinciri kolonları (#259).
 * `src/database/migrations/` DIŞINDA tutulur (TypeORM runner describe'ı
 * migration sanmasın — mevcut migration spec deseniyle aynı).
 */
describe('AddAuditLogChain1827000000000 (#259)', () => {
  const migration = new AddAuditLogChain1827000000000();
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

  it('up() adds the chain columns idempotently', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('ADD COLUMN IF NOT EXISTS "seq" bigserial');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "prev_hash" varchar(64)');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "entry_hash" varchar(64)');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "signature" varchar(64)');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS "signature_key_id" varchar(40)');
    expect(all).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "uq_audit_logs_seq"');
    expect(all).toContain('CREATE INDEX IF NOT EXISTS "idx_audit_logs_entry_hash"');
  });

  it('up() is re-runnable (every ALTER uses IF NOT EXISTS)', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const calls = (runner as unknown as { calls: string[] }).calls;
    const altered = calls.filter((sql) => sql.includes('ALTER TABLE'));
    expect(altered.length).toBeGreaterThan(0);
    for (const sql of altered) {
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    }
  });

  it('down() removes indexes and chain columns idempotently', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('DROP INDEX IF EXISTS "idx_audit_logs_entry_hash"');
    expect(all).toContain('DROP INDEX IF EXISTS "uq_audit_logs_seq"');
    expect(all).toContain('DROP COLUMN IF EXISTS "signature_key_id"');
    expect(all).toContain('DROP COLUMN IF EXISTS "signature"');
    expect(all).toContain('DROP COLUMN IF EXISTS "entry_hash"');
    expect(all).toContain('DROP COLUMN IF EXISTS "prev_hash"');
    expect(all).toContain('DROP COLUMN IF EXISTS "seq"');
  });
});
