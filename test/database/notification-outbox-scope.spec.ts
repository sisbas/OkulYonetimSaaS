import { DataSource, EntityManager } from 'typeorm';
import { NotificationOutboxRepository } from '../../src/notifications/notification-outbox.repository';
import { AbsenceNotificationService } from '../../src/notifications/absence-notification.service';
import { RequestContext } from '../../src/common/context/request-context';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const tenantA = '10000000-0000-4000-8000-000000000001';
const tenantB = '10000000-0000-4000-8000-000000000002';
const branchX = '20000000-0000-4000-8000-000000000001';
const branchY = '20000000-0000-4000-8000-000000000002';
const sessionX = '30000000-0000-4000-8000-000000000001';
const sessionY = '30000000-0000-4000-8000-000000000002';
const sessionB = '30000000-0000-4000-8000-000000000003';
const student = '40000000-0000-4000-8000-000000000001';
const actor = '50000000-0000-4000-8000-000000000001';
const ctx: RequestContext = { requestId: 'n0-regression', tenantId: tenantA, branchId: branchX };
const repo = new NotificationOutboxRepository();

// NON-ACCEPTANCE SQL regression: session-local temporary fixtures, never a
// genuine business/UI journey or notification delivery/pilot acceptance.
withPostgres('N0 real PostgreSQL scope and canonical transaction regressions', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', url: databaseUrl, entities: [], synchronize: false });
    await ds.initialize();
  });
  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  async function fixture(manager: EntityManager) {
    await manager.query(`
      CREATE TEMP TABLE attendance_sessions (id uuid PRIMARY KEY, tenant_id uuid, branch_id uuid, status text) ON COMMIT DROP;
      CREATE TEMP TABLE attendance_records (tenant_id uuid, session_id uuid, student_id uuid, status text) ON COMMIT DROP;
      CREATE TEMP TABLE kvkk_consent_subjects (id uuid, tenant_id uuid, subject_ref_id uuid, subject_type text, status text) ON COMMIT DROP;
      CREATE TEMP TABLE kvkk_consents (id uuid, tenant_id uuid, subject_id uuid, consent_type text, status text, revoked_at timestamptz, expires_at timestamptz, version int, created_at timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE notification_outbox (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id uuid, dedupe_key varchar,
        event_type varchar, student_id uuid, session_id uuid, channel varchar,
        status varchar CHECK (status IN ('pending', 'blocked_consent', 'dispatched', 'failed')),
        payload_masked jsonb, reason varchar, consent_version int, created_by_id uuid,
        available_at timestamptz DEFAULT now(), UNIQUE (tenant_id, dedupe_key)
      ) ON COMMIT DROP;
    `);
    await manager.query(`INSERT INTO attendance_sessions VALUES
      ($1, $2, $3, 'locked'), ($4, $2, $5, 'locked'), ($6, $7, $3, 'locked')`,
      [sessionX, tenantA, branchX, sessionY, branchY, sessionB, tenantB]);
  }

  it('A/X sees only its due pending projection; excludes cross-tenant/session mismatch and non-due states', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await manager.query(`INSERT INTO notification_outbox (tenant_id, session_id, channel, status, dedupe_key, available_at) VALUES
        ($1, $2, 'sms', 'pending', 'own', now()),
        ($1, $3, 'sms', 'pending', 'other-branch', now()),
        ($4, $5, 'sms', 'pending', 'other-tenant', now()),
        ($1, $5, 'sms', 'pending', 'tenant-session-mismatch', now()),
        ($1, $2, 'sms', 'blocked_consent', 'blocked', now()),
        ($1, $2, 'sms', 'pending', 'future', now() + interval '1 day'),
        ($1, $2, 'sms', 'dispatched', 'dispatched', now()),
        ($1, $2, 'sms', 'failed', 'failed', now())`,
        [tenantA, sessionX, sessionY, tenantB, sessionB]);
      const rows = await repo.findPending(manager, ctx, 10);
      const [own] = await manager.query(`SELECT id FROM notification_outbox WHERE dedupe_key = 'own'`);
      expect(rows).toEqual([{ id: own.id, tenantId: tenantA, channel: 'sms' }]);
      expect(Object.keys(rows[0]).sort()).toEqual(['channel', 'id', 'tenantId']);
      expect(await repo.findPending(manager, { ...ctx, branchId: branchY }, 10)).toHaveLength(1);
      expect(await repo.findPending(manager, { ...ctx, tenantId: tenantB }, 10)).toHaveLength(1);
    });
  });

  it('enforces bounded limits on real rows', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await manager.query(`INSERT INTO notification_outbox (tenant_id, session_id, channel, status, dedupe_key)
        SELECT $1::uuid, $2::uuid, 'sms', 'pending', 'limit-' || n FROM generate_series(1, 501) n`, [tenantA, sessionX]);
      expect(await repo.findPending(manager, ctx, 1)).toHaveLength(1);
      expect(await repo.findPending(manager, ctx, 1000)).toHaveLength(500);
    });
  });

  it('preserves locked absence, consent, masking and idempotency in the caller transaction', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      const service = new AbsenceNotificationService(repo);
      const input = { tenantId: tenantA, sessionId: sessionX, actorUserId: actor };
      await manager.query(`INSERT INTO attendance_records VALUES ($1, $2, $3, 'absent')`, [tenantA, sessionX, student]);
      for (const status of ['draft', 'published']) {
        await manager.query(`UPDATE attendance_sessions SET status = $1 WHERE id = $2`, [status, sessionX]);
        expect((await service.enqueueLockedAbsenceNotifications(manager, input)).insertedRows).toBe(0);
      }
      await manager.query(`UPDATE attendance_sessions SET status = 'locked' WHERE id = $1`, [sessionX]);
      await manager.query(`UPDATE attendance_records SET status = 'not_marked'`);
      expect((await service.enqueueLockedAbsenceNotifications(manager, input)).insertedRows).toBe(0);
      await manager.query(`UPDATE attendance_records SET status = 'absent'`);
      await manager.query(`SAVEPOINT consent_denial`);
      expect((await service.enqueueLockedAbsenceNotifications(manager, input)).intendedBlockedConsent).toBe(1);
      expect(await repo.findPending(manager, ctx, 10)).toEqual([]);
      await manager.query(`ROLLBACK TO SAVEPOINT consent_denial`);
      await manager.query(`INSERT INTO kvkk_consent_subjects VALUES ($1, $2, $3, 'student', 'active')`, [actor, tenantA, student]);
      await manager.query(`INSERT INTO kvkk_consents VALUES
        (gen_random_uuid(), $2, $1, 'parent_notification', 'approved', NULL, NULL, 1, now()),
        (gen_random_uuid(), $2, $1, 'sms_notification', 'approved', NULL, NULL, 1, now())`, [actor, tenantA]);
      await manager.query(`SAVEPOINT domain_mutation`);
      expect((await service.enqueueLockedAbsenceNotifications(manager, input)).insertedRows).toBe(1);
      expect((await service.enqueueLockedAbsenceNotifications(manager, input)).duplicatesSkipped).toBe(1);
      const [row] = await manager.query(`SELECT status, payload_masked FROM notification_outbox`);
      expect(row.status).toBe('pending');
      expect(row.payload_masked.studentRef).toBeTruthy();
      expect(row.payload_masked.sessionRef).toBeTruthy();
      expect(JSON.stringify(row.payload_masked)).not.toContain(student);
      expect(JSON.stringify(row.payload_masked)).not.toContain(sessionX);
      await manager.query(`ROLLBACK TO SAVEPOINT domain_mutation`);
      expect(await repo.findPending(manager, ctx, 10)).toEqual([]);
    });
  });

  it('propagates real storage/schema failure instead of successful empty results', async () => {
    await ds.transaction(async (manager) => {
      await fixture(manager);
      await manager.query(`DROP TABLE pg_temp.notification_outbox`);
      // pg_temp-only search path prevents accidentally reading a persistent table.
      await manager.query(`SET LOCAL search_path TO pg_temp`);
      await expect(repo.findPending(manager, ctx, 10)).rejects.toThrow();
    });
  });
});

describe('N0 scope/limit pre-storage denial', () => {
  it.each([{ ...ctx, tenantId: undefined }, { ...ctx, branchId: undefined },
    { ...ctx, tenantId: ' ' }, { ...ctx, branchId: '' }])('rejects missing scope before query: %j', async (context) => {
    const query = jest.fn();
    await expect(repo.findPending({ query } as unknown as EntityManager, context, 10))
      .rejects.toThrow('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    expect(query).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid limit %s before query', async (limit) => {
    const query = jest.fn();
    await expect(repo.findPending({ query } as unknown as EntityManager, ctx, limit))
      .rejects.toThrow('NOTIFICATION_OUTBOX_LIMIT_INVALID');
    expect(query).not.toHaveBeenCalled();
  });
});
