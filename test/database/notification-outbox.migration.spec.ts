import { CreateNotificationOutbox1829000000000 } from '../../src/database/migrations/1829000000000-CreateNotificationOutbox';

/**
 * Migration smoke: transactional outbox tablosu (#266).
 * `src/database/migrations/` DIŞINDA tutulur (runner describe'ı migration sanmasın).
 */
describe('CreateNotificationOutbox1829000000000 (#266)', () => {
  const migration = new CreateNotificationOutbox1829000000000();
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

  it('up() creates the outbox table with idempotency and status guards', async () => {
    const runner = makeRunner();
    await migration.up(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('CREATE TABLE IF NOT EXISTS "notification_outbox"');
    expect(all).toContain('"dedupe_key" varchar(160) NOT NULL');
    expect(all).toContain('"payload_masked" jsonb NOT NULL');
    expect(all).toContain('"consent_version" integer NULL');
    expect(all).toContain(
      "CHECK (\"status\" IN ('pending', 'blocked_consent', 'dispatched', 'failed'))",
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_notification_outbox_tenant_dedupe"',
    );
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_notification_outbox_pending"',
    );
  });

  it('down() drops indexes and the table idempotently', async () => {
    const runner = makeRunner();
    await migration.down(runner as never);
    const all = (runner as unknown as { calls: string[] }).calls.join('\n');

    expect(all).toContain('DROP INDEX IF EXISTS "idx_notification_outbox_pending"');
    expect(all).toContain(
      'DROP INDEX IF EXISTS "uq_notification_outbox_tenant_dedupe"',
    );
    expect(all).toContain('DROP TABLE IF EXISTS "notification_outbox"');
  });
});
