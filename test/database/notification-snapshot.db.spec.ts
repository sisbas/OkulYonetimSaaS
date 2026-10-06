import { DataSource } from 'typeorm';
import { CreateNotificationOutbox1829000000000 } from '../../src/database/migrations/1829000000000-CreateNotificationOutbox';
import { AddNotificationSnapshot1860000000000 } from '../../src/database/migrations/1860000000000-AddNotificationSnapshot';
import { CreateTenants1700000000002 } from '../../src/database/migrations/1700000000002-CreateTenants';
import { CreateAttendanceSessions1824000000000 } from '../../src/database/migrations/1824000000000-CreateAttendanceSessions';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '10000000-0000-4000-8000-000000000002';
const BRANCH_ID = '20000000-0000-4000-8000-000000000001';
const SESSION_ID = '30000000-0000-4000-8000-000000000001';
const STUDENT_ID = '40000000-0000-4000-8000-000000000001';

// NON-ACCEPTANCE SQL regression: session-local temporary fixtures, never a
// genuine business/UI journey or notification delivery/pilot acceptance.
withPostgres('N1c real PostgreSQL snapshot + draft regressions', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: databaseUrl, entities: [], synchronize: false });
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    try {
      const tenantsMigration = new CreateTenants1700000000002();
      const sessionsMigration = new CreateAttendanceSessions1824000000000();
      const outboxMigration = new CreateNotificationOutbox1829000000000();
      const snapshotMigration = new AddNotificationSnapshot1860000000000();
      await tenantsMigration.up(runner);
      await sessionsMigration.up(runner);
      await outboxMigration.up(runner);
      await snapshotMigration.up(runner);
    } finally {
      await runner.release();
    }
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DELETE FROM notification_outbox WHERE tenant_id = ANY($1::uuid[])`, [[TENANT_ID, OTHER_TENANT_ID]]);
    await dataSource.query(`DELETE FROM attendance_sessions WHERE tenant_id = ANY($1::uuid[])`, [[TENANT_ID, OTHER_TENANT_ID]]);
    await dataSource.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[TENANT_ID, OTHER_TENANT_ID]]);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(`DELETE FROM notification_outbox WHERE tenant_id = ANY($1::uuid[])`, [[TENANT_ID, OTHER_TENANT_ID]]);
    await dataSource.query(`DELETE FROM attendance_sessions WHERE tenant_id = ANY($1::uuid[])`, [[TENANT_ID, OTHER_TENANT_ID]]);
    await dataSource.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[TENANT_ID, OTHER_TENANT_ID]]);
    await dataSource.query(`INSERT INTO tenants (id, slug, name) VALUES ($1, 'n1c-test', 'N1c Test') ON CONFLICT (slug) DO NOTHING`, [TENANT_ID]);
  });

  it('adds snapshot column and version column to notification_outbox (migration postcondition)', async () => {
    const cols = (await dataSource.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'notification_outbox'
          AND column_name IN ('snapshot', 'version')
        ORDER BY column_name`,
    )) as Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>;
    expect(cols).toHaveLength(2);
    const snapshotCol = cols.find((c) => c.column_name === 'snapshot');
    const versionCol = cols.find((c) => c.column_name === 'version');
    expect(snapshotCol).toBeDefined();
    expect(snapshotCol!.data_type).toBe('jsonb');
    expect(snapshotCol!.is_nullable).toBe('YES');
    expect(versionCol).toBeDefined();
    expect(versionCol!.data_type).toBe('integer');
    expect(versionCol!.is_nullable).toBe('NO');
    expect(versionCol!.column_default).toBe('0');
  });

  it('status CHECK constraint includes approved and closed', async () => {
    const constraints = (await dataSource.query(
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conname = 'chk_notification_outbox_status'`,
    )) as Array<{ def: string }>;
    expect(constraints).toHaveLength(1);
    expect(constraints[0].def).toContain('approved');
    expect(constraints[0].def).toContain('closed');
  });

  it('enqueue with snapshot stores immutable snapshot (round-trip)', async () => {
    const snapshot = {
      source: { sessionRef: 'p1:session:abc', studentRef: 'p1:student:def', attendanceStatus: 'absent', sessionStatus: 'locked' },
      contact: { channel: 'sms', maskedDisplay: '+90 532 *** ** 12', verificationStatus: 'verified' },
      consent: { approved: true, reason: null, consentId: 'c1', consentVersion: 2 },
      template: { eventType: 'attendance.absent.locked', channel: 'sms', templateRef: 'attendance.absent.locked:sms' },
      enqueuedAt: '2026-10-05T12:00:00.000Z',
    };
    const inserted = (await dataSource.query(
      `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, reason, consent_version, created_by_id, snapshot, version)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NULL, 2, NULL, $8, 0)
       RETURNING id, snapshot, version`,
      [TENANT_ID, 'dedupe-1', 'attendance.absent.locked', STUDENT_ID, SESSION_ID, 'sms', JSON.stringify({ eventType: 'attendance.absent.locked' }), JSON.stringify(snapshot)],
    )) as Array<{ id: string; snapshot: Record<string, unknown>; version: number }>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].version).toBe(0);
    expect(inserted[0].snapshot).toEqual(snapshot);
  });

  it('snapshot is immutable after write (no UPDATE allowed on snapshot column)', async () => {
    const snapshot = {
      source: { sessionRef: 'p1:session:abc', studentRef: 'p1:student:def', attendanceStatus: 'absent', sessionStatus: 'locked' },
      contact: { channel: 'sms', maskedDisplay: null, verificationStatus: null },
      consent: { approved: true, reason: null, consentId: 'c1', consentVersion: 1 },
      template: { eventType: 'attendance.absent.locked', channel: 'sms', templateRef: 'attendance.absent.locked:sms' },
      enqueuedAt: '2026-10-05T12:00:00.000Z',
    };
    const inserted = (await dataSource.query(
      `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, snapshot, version)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', '{}', $7, 0)
       RETURNING id`,
      [TENANT_ID, 'dedupe-imm', 'attendance.absent.locked', STUDENT_ID, SESSION_ID, 'sms', JSON.stringify(snapshot)],
    )) as Array<{ id: string }>;
    const id = inserted[0].id;
    const newSnapshot = { ...snapshot, consent: { ...snapshot.consent, approved: false } };
    await expect(
      dataSource.query(
        `UPDATE notification_outbox SET snapshot = $1 WHERE id = $2`,
        [JSON.stringify(newSnapshot), id],
      ),
    ).rejects.toThrow();
    const rows = (await dataSource.query(
      `SELECT snapshot FROM notification_outbox WHERE id = $1`,
      [id],
    )) as Array<{ snapshot: Record<string, unknown> }>;
    expect(rows[0].snapshot).toEqual(snapshot);
  });

  it('draft list returns only pending and blocked_consent rows', async () => {
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `CREATE TEMP TABLE attendance_sessions (id uuid PRIMARY KEY, tenant_id uuid, branch_id uuid, status text) ON COMMIT DROP`,
      );
      await manager.query(
        `INSERT INTO attendance_sessions VALUES ($1, $2, $3, 'locked')`,
        [SESSION_ID, TENANT_ID, BRANCH_ID],
      );
      const statuses = ['pending', 'blocked_consent', 'dispatched', 'failed', 'approved', 'closed'];
      for (let i = 0; i < statuses.length; i++) {
        await manager.query(
          `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, version)
           VALUES ($1, $2, 'attendance.absent.locked', $3, $4, 'sms', $5, '{}', 0)`,
          [TENANT_ID, `dedupe-${i}`, STUDENT_ID, SESSION_ID, statuses[i]],
        );
      }
      const drafts = (await manager.query(
        `SELECT o.id, o.status
           FROM notification_outbox o
           JOIN attendance_sessions s ON s.id = o.session_id AND s.tenant_id = o.tenant_id
          WHERE o.tenant_id = $1 AND s.branch_id = $2
            AND o.status IN ('pending', 'blocked_consent')
          ORDER BY o.available_at ASC, o.id ASC`,
        [TENANT_ID, BRANCH_ID],
      )) as Array<{ id: string; status: string }>;
      expect(drafts).toHaveLength(2);
      expect(drafts.map((d) => d.status).sort()).toEqual(['blocked_consent', 'pending']);
    });
  });

  it('draft transition: pending → approved with optimistic concurrency', async () => {
    const inserted = (await dataSource.query(
      `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, version)
       VALUES ($1, $2, 'attendance.absent.locked', $3, $4, 'sms', 'pending', '{}', 0)
       RETURNING id`,
      [TENANT_ID, 'dedupe-appr', STUDENT_ID, SESSION_ID],
    )) as Array<{ id: string }>;
    const id = inserted[0].id;
    const updatedRaw = await dataSource.query(
      `UPDATE notification_outbox
          SET status = 'approved', version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND version = 0
        RETURNING id, status, version`,
      [TENANT_ID, id],
    );
    const updated = (Array.isArray(updatedRaw) && Array.isArray(updatedRaw[0]) ? updatedRaw[0] : updatedRaw) as Array<{
      id: string;
      status: string;
      version: number;
    }>;
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('approved');
    expect(updated[0].version).toBe(1);
  });

  it('draft transition: pending → closed with optimistic concurrency', async () => {
    const inserted = (await dataSource.query(
      `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, version)
       VALUES ($1, $2, 'attendance.absent.locked', $3, $4, 'sms', 'pending', '{}', 0)
       RETURNING id`,
      [TENANT_ID, 'dedupe-close', STUDENT_ID, SESSION_ID],
    )) as Array<{ id: string }>;
    const id = inserted[0].id;
    const updatedRaw = await dataSource.query(
      `UPDATE notification_outbox
          SET status = 'closed', version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND version = 0
        RETURNING id, status, version`,
      [TENANT_ID, id],
    );
    const updated = (Array.isArray(updatedRaw) && Array.isArray(updatedRaw[0]) ? updatedRaw[0] : updatedRaw) as Array<{
      id: string;
      status: string;
      version: number;
    }>;
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('closed');
    expect(updated[0].version).toBe(1);
  });

  it('draft transition rejects stale version (optimistic concurrency)', async () => {
    const inserted = (await dataSource.query(
      `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, version)
       VALUES ($1, $2, 'attendance.absent.locked', $3, $4, 'sms', 'pending', '{}', 0)
       RETURNING id`,
      [TENANT_ID, 'dedupe-stale', STUDENT_ID, SESSION_ID],
    )) as Array<{ id: string }>;
    const id = inserted[0].id;
    const updatedRaw = await dataSource.query(
      `UPDATE notification_outbox
          SET status = 'approved', version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND version = 99
        RETURNING id`,
      [TENANT_ID, id],
    );
    const updated = (Array.isArray(updatedRaw) && Array.isArray(updatedRaw[0]) ? updatedRaw[0] : updatedRaw) as Array<{ id: string }>;
    expect(updated).toHaveLength(0);
  });

  it('draft transition rejects non-pending status', async () => {
    const inserted = (await dataSource.query(
      `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, version)
       VALUES ($1, $2, 'attendance.absent.locked', $3, $4, 'sms', 'dispatched', '{}', 0)
       RETURNING id`,
      [TENANT_ID, 'dedupe-disp', STUDENT_ID, SESSION_ID],
    )) as Array<{ id: string }>;
    const id = inserted[0].id;
    const updatedRaw = await dataSource.query(
      `UPDATE notification_outbox
          SET status = 'approved', version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending' AND version = 0
        RETURNING id`,
      [TENANT_ID, id],
    );
    const updated = (Array.isArray(updatedRaw) && Array.isArray(updatedRaw[0]) ? updatedRaw[0] : updatedRaw) as Array<{ id: string }>;
    expect(updated).toHaveLength(0);
  });

  it('tenant isolation: drafts from other tenants are not visible', async () => {
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO tenants (id, slug, name) VALUES ($1, 'n1c-other', 'N1c Other') ON CONFLICT (slug) DO NOTHING`,
        [OTHER_TENANT_ID],
      );
      await manager.query(
        `CREATE TEMP TABLE attendance_sessions (id uuid PRIMARY KEY, tenant_id uuid, branch_id uuid, status text) ON COMMIT DROP`,
      );
      await manager.query(
        `INSERT INTO attendance_sessions VALUES ($1, $2, $3, 'locked')`,
        ['30000000-0000-4000-8000-000000000002', OTHER_TENANT_ID, BRANCH_ID],
      );
      await manager.query(
        `INSERT INTO notification_outbox (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, version)
         VALUES ($1, $2, 'attendance.absent.locked', $3, $4, 'sms', 'pending', '{}', 0)`,
        [OTHER_TENANT_ID, 'dedupe-other', STUDENT_ID, '30000000-0000-4000-8000-000000000002'],
      );
      const drafts = (await manager.query(
        `SELECT o.id
           FROM notification_outbox o
           JOIN attendance_sessions s ON s.id = o.session_id AND s.tenant_id = o.tenant_id
          WHERE o.tenant_id = $1 AND s.branch_id = $2
            AND o.status IN ('pending', 'blocked_consent')`,
        [TENANT_ID, BRANCH_ID],
      )) as Array<{ id: string }>;
      expect(drafts).toHaveLength(0);
    });
  });
});
