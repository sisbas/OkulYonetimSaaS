import { AddAuditChainCheckpoints1828000000000 } from '../../src/database/migrations/1828000000000-AddAuditChainCheckpoints';

/**
 * Migration smoke: audit retention checkpoint tablosu (#259).
 * `src/database/migrations/` DIŞINDA tutulur (TypeORM runner describe'ı
 * migration sanmasın — mevcut migration spec deseniyle aynı).
 */
describe('AddAuditChainCheckpoints1828000000000 (#259)', () => {
  const migration = new AddAuditChainCheckpoints1828000000000();
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

  it('up() creates the checkpoint table idempotently with a unique sequence guard', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('CREATE TABLE IF NOT EXISTS "audit_chain_checkpoints"');
    expect(all).toContain('"up_to_sequence" bigint NOT NULL');
    expect(all).toContain('"head_hash" varchar(64) NOT NULL');
    expect(all).toContain('"signature" varchar(64) NOT NULL');
    expect(all).toContain('"signature_key_id" varchar(40) NOT NULL');
    expect(all).toContain('"pruned_row_count" integer NOT NULL DEFAULT 0');
    expect(all).toContain('CONSTRAINT "uq_audit_chain_checkpoints_sequence"');
    expect(all).toContain('CREATE INDEX IF NOT EXISTS "idx_audit_chain_checkpoints_sequence"');
  });

  it('down() removes the index and table idempotently', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('DROP INDEX IF EXISTS "idx_audit_chain_checkpoints_sequence"');
    expect(all).toContain('DROP TABLE IF EXISTS "audit_chain_checkpoints"');
  });
});
