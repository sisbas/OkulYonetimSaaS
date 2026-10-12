import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  MAX_BULK_VERSIONS,
  NotificationOutboxRepository,
} from '../../src/notifications/notification-outbox.repository';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const tenantA = '10000000-0000-4000-8000-000000000001';
const branchX = '20000000-0000-4000-8000-000000000001';
const sessionX = '30000000-0000-4000-8000-000000000001';
const repo = new NotificationOutboxRepository();

const baseInput = {
  tenantId: tenantA,
  branchId: branchX,
  sessionId: sessionX,
  targetStatus: 'approved' as const,
};

// NON-ACCEPTANCE SQL regression (#389): session-local temporary fixtures.
withPostgres('N2 bulk approve completeness regressions (#389)', () => {
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
        event_type varchar, student_id uuid, session_id uuid, channel varchar,
        status varchar CHECK (status IN ('pending', 'blocked_consent', 'approved', 'closed', 'dispatched', 'failed')),
        payload_masked jsonb, reason varchar, consent_version int, created_by_id uuid,
        snapshot jsonb, version int DEFAULT 0,
        available_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        UNIQUE (tenant_id, dedupe_key)
      ) ON COMMIT DROP;
    `);
    await manager.query(
      `INSERT INTO attendance_sessions VALUES ($1, $2, $3, 'locked')`,
      [sessionX, tenantA, branchX],
    );
  }

  async function seedDrafts(manager: EntityManager, count: number, status = 'pending') {
    await manager.query(
      `INSERT INTO notification_outbox (tenant_id, session_id, channel, status, dedupe_key, version)
       SELECT $1::uuid, $2::uuid, 'sms', $3::varchar, 'bulk-' || n, 0
         FROM generate_series(1, $4::int) n`,
      [tenantA, sessionX, status, count],
    );
  }

  async function clientList(manager: EntityManager, limit: number, offset = 0) {
    const rows = await manager.query(
      `SELECT id, version FROM notification_outbox
        WHERE tenant_id = $1 AND session_id = $2
        ORDER BY dedupe_key ASC LIMIT $3 OFFSET $4`,
      [tenantA, sessionX, limit, offset],
    ) as Array<{ id: string; version: number }>;
    return rows.map((row) => ({ id: row.id, version: Number(row.version) }));
  }

  async function statusCounts(manager: EntityManager) {
    const rows = await manager.query(
      `SELECT status, COUNT(*)::int AS count FROM notification_outbox GROUP BY status ORDER BY status`,
    ) as Array<{ status: string; count: number }>;
    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  }

  it('rejects the 20-row page-truncated list and approves nothing', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await seedDrafts(manager, 25);
      const page = await clientList(manager, 20);
      expect(page).toHaveLength(20);
      await expect(
        repo.transitionDraftsForSession(manager, { ...baseInput, expectedVersions: page }),
      ).rejects.toThrow('NOTIFICATION_BULK_INCOMPLETE_LIST');
      expect(await statusCounts(manager)).toEqual({ pending: 25 });
    });
  });

  it('rejects a list missing exactly one draft and approves nothing', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await seedDrafts(manager, 3);
      const complete = await clientList(manager, 3);
      await expect(
        repo.transitionDraftsForSession(manager, {
          ...baseInput,
          expectedVersions: complete.slice(0, 2),
        }),
      ).rejects.toThrow('NOTIFICATION_BULK_INCOMPLETE_LIST');
      expect(await statusCounts(manager)).toEqual({ pending: 3 });
    });
  });

  it('rejects an oversized client version list before touching rows', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await seedDrafts(manager, 3);
      const oversized = Array.from({ length: MAX_BULK_VERSIONS + 1 }, (_, index) => ({
        id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        version: 0,
      }));
      const error = await repo
        .transitionDraftsForSession(manager, { ...baseInput, expectedVersions: oversized })
        .catch((e: Error) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toContain('NOTIFICATION_BULK_VERSIONS_TOO_LARGE');
      expect(await statusCounts(manager)).toEqual({ pending: 3 });
    });
  });

  it('approves a complete mixed-status list atomically and bumps versions', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await seedDrafts(manager, 2);
      await manager.query(
        `INSERT INTO notification_outbox (tenant_id, session_id, channel, status, dedupe_key, version)
         VALUES ($1, $2, 'sms', 'blocked_consent', 'bulk-blocked', 0)`,
        [tenantA, sessionX],
      );
      const complete = await clientList(manager, 3);
      const result = await repo.transitionDraftsForSession(manager, {
        ...baseInput,
        expectedVersions: complete,
      });
      expect(result).toHaveLength(3);
      expect(result.every((row) => row.status === 'approved')).toBe(true);
      expect(await statusCounts(manager)).toEqual({ approved: 3 });
      const versions = await manager.query(
        `SELECT DISTINCT version FROM notification_outbox`,
      ) as Array<{ version: number }>;
      expect(versions.map((row) => Number(row.version))).toEqual([1]);
    });
  });

  it('rolls back the whole batch when one version is stale (all-or-nothing)', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await seedDrafts(manager, 3);
      const complete = await clientList(manager, 3);
      const stale = complete.map((row, index) =>
        index === 1 ? { ...row, version: row.version + 1 } : row,
      );
      await manager.query('SAVEPOINT bulk_stale');
      await expect(
        repo.transitionDraftsForSession(manager, { ...baseInput, expectedVersions: stale }),
      ).rejects.toBeInstanceOf(ConflictException);
      await manager.query('ROLLBACK TO SAVEPOINT bulk_stale');
      expect(await statusCounts(manager)).toEqual({ pending: 3 });
    });
  });
});
