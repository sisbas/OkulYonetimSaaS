import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { NotificationOutboxRepository } from '../../src/notifications/notification-outbox.repository';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const tenantA = '10000000-0000-4000-8000-000000000001';
const tenantB = '10000000-0000-4000-8000-000000000002';
const branchX = '20000000-0000-4000-8000-000000000001';
const branchY = '20000000-0000-4000-8000-000000000002';
const sessionX = '30000000-0000-4000-8000-000000000001';
const sessionY = '30000000-0000-4000-8000-000000000002';
const sessionZ = '30000000-0000-4000-8000-000000000003';
const repo = new NotificationOutboxRepository();

// #464 NON-ACCEPTANCE SQL regression: session-local temporary fixtures.
// A branch with 25 pending drafts in one session (more than the 20-row
// notification page) must be approved as a whole; a page-sized subset must
// fail closed instead of reporting "bulk approved" while drafts remain.
withPostgres('N1c real PostgreSQL complete-set session bulk approval (#464)', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', url: databaseUrl, entities: [], synchronize: false });
    await ds.initialize();
  });
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  async function fixture(manager: EntityManager) {
    await manager.query(`
      CREATE TEMP TABLE attendance_sessions (id uuid PRIMARY KEY, tenant_id uuid, branch_id uuid, status text) ON COMMIT DROP;
      CREATE TEMP TABLE notification_outbox (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid, dedupe_key varchar,
        event_type varchar, session_id uuid, channel varchar,
        status varchar CHECK (status IN ('pending', 'blocked_consent', 'approved', 'dispatched', 'failed')),
        payload_masked jsonb, version int DEFAULT 0,
        available_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        UNIQUE (tenant_id, dedupe_key)
      ) ON COMMIT DROP;
    `);
    await manager.query(`
      INSERT INTO attendance_sessions VALUES
        ($1, $2, $3, 'locked'), ($4, $2, $3, 'locked'), ($5, $2, $6, 'locked')`,
      [sessionX, tenantA, branchX, sessionY, sessionZ, branchY]);
    // Y taslakları daha eski `available_at` ile eklenir: gerçek bildirim
    // listesi `available_at, id` sırasıyla sayfalandığı için ilk 20 satır
    // deterministik olarak iki oturumu karıştırır (#464 senaryosu).
    await manager.query(`
      INSERT INTO notification_outbox (tenant_id, session_id, channel, status, dedupe_key, available_at)
      SELECT $1::uuid, $2::uuid, 'sms', 'pending', 'x-' || n, now() FROM generate_series(1, 25) n
      UNION ALL
      SELECT $1::uuid, $3::uuid, 'sms', 'blocked_consent', 'y-' || n, now() - interval '1 minute' FROM generate_series(1, 3) n
      UNION ALL
      SELECT $1::uuid, $4::uuid, 'sms', 'pending', 'z-' || n, now() FROM generate_series(1, 2) n
      UNION ALL
      SELECT $5::uuid, $2::uuid, 'sms', 'pending', 'cross-tenant-' || n, now() FROM generate_series(1, 2) n`,
      [tenantA, sessionX, sessionY, sessionZ, tenantB]);
  }

  async function pendingIds(manager: EntityManager, tenantId: string, sessionId: string) {
    return (await manager.query(
      `SELECT id, version FROM notification_outbox
        WHERE tenant_id = $1 AND session_id = $2 AND status IN ('pending', 'blocked_consent')
        ORDER BY id`,
      [tenantId, sessionId],
    )) as Array<{ id: string; version: number }>;
  }

  it('approves the complete set and ignores pending rows of another tenant on the same session id', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      const expectedVersions = (await pendingIds(manager, tenantA, sessionX)).map((row) => ({
        id: row.id,
        version: Number(row.version),
      }));

      const updated = await repo.transitionDraftsForSession(manager, {
        tenantId: tenantA,
        branchId: branchX,
        sessionId: sessionX,
        targetStatus: 'approved',
        expectedVersions,
      });

      expect(updated).toHaveLength(25);
      expect(updated.every((row) => row.status === 'approved' && row.version === 1)).toBe(true);
      expect(await pendingIds(manager, tenantA, sessionX)).toEqual([]);
      // Other sessions and the cross-tenant rows are untouched: the completeness
      // guard counts only this tenant's branch-visible drafts.
      expect(await pendingIds(manager, tenantA, sessionY)).toHaveLength(3);
      expect(await pendingIds(manager, tenantA, sessionZ)).toHaveLength(2);
      expect(await pendingIds(manager, tenantB, sessionX)).toHaveLength(2);
    });
  });

  it('rejects a session above the supported batch size instead of approving a prefix', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await manager.query(`
        INSERT INTO notification_outbox (tenant_id, session_id, channel, status, dedupe_key)
        SELECT $1::uuid, $2::uuid, 'sms', 'pending', 'oversize-' || n FROM generate_series(1, 198) n`,
        [tenantA, sessionY]);
      const expectedVersions = (await pendingIds(manager, tenantA, sessionY)).map((row) => ({
        id: row.id,
        version: Number(row.version),
      }));
      expect(expectedVersions.length).toBe(201);

      await manager.query('SAVEPOINT bulk_oversize');
      await expect(repo.transitionDraftsForSession(manager, {
        tenantId: tenantA,
        branchId: branchX,
        sessionId: sessionY,
        targetStatus: 'approved',
        expectedVersions,
      })).rejects.toMatchObject({ response: { message: 'NOTIFICATION_BULK_VERSIONS_TOO_MANY' } });
      await manager.query('ROLLBACK TO SAVEPOINT bulk_oversize');

      expect(await pendingIds(manager, tenantA, sessionY)).toHaveLength(201);
    });
  });

  it('fails closed and keeps every draft pending when a mixed-session page subset is submitted', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      // The old UI submitted the drafts of one session from notification page 1
      // (`available_at, id` ordering): a mixed-session page that misses drafts.
      const mixedPage = (await manager.query(
        `SELECT id, session_id AS "sessionId", version FROM notification_outbox
          WHERE tenant_id = $1 AND status IN ('pending', 'blocked_consent')
          ORDER BY available_at ASC, id ASC LIMIT 20`,
        [tenantA],
      )) as Array<{ id: string; sessionId: string; version: number }>;
      expect(new Set(mixedPage.map((row) => row.sessionId)).size).toBe(2);
      const pageSubset = mixedPage
        .filter((row) => row.sessionId === sessionX)
        .map((row) => ({ id: row.id, version: Number(row.version) }));
      expect(pageSubset).toHaveLength(17);

      // Production'da ConflictException transaction'ı geri alır; burada aynı
      // etkiyi gözlemlemek için savepoint kullanılıyor.
      await manager.query('SAVEPOINT bulk_partial');
      await expect(repo.transitionDraftsForSession(manager, {
        tenantId: tenantA,
        branchId: branchX,
        sessionId: sessionX,
        targetStatus: 'approved',
        expectedVersions: pageSubset,
      })).rejects.toBeInstanceOf(ConflictException);
      await manager.query('ROLLBACK TO SAVEPOINT bulk_partial');

      expect(await pendingIds(manager, tenantA, sessionX)).toHaveLength(25);
      expect(await pendingIds(manager, tenantA, sessionY)).toHaveLength(3);
    });
  });
});
