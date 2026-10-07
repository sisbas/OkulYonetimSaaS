import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CreateTenants1700000000002 } from '../../src/database/migrations/1700000000002-CreateTenants';
import { CreateKvkkConsents1700000000010 } from '../../src/database/migrations/1700000000010-CreateKvkkConsents';
import { CreateAttendanceSessions1824000000000 } from '../../src/database/migrations/1824000000000-CreateAttendanceSessions';
import { CreateNotificationOutbox1829000000000 } from '../../src/database/migrations/1829000000000-CreateNotificationOutbox';
import { AddNotificationSnapshot1860000000000 } from '../../src/database/migrations/1860000000000-AddNotificationSnapshot';
import { AddNotificationDispatch1870000000000 } from '../../src/database/migrations/1870000000000-AddNotificationDispatch';
import { RequestContext } from '../../src/common/context/request-context';
import {
  backoffMsForAttempts,
  NotificationDispatchRepository,
} from '../../src/notifications/notification-dispatch.repository';
import { NotificationDispatchService } from '../../src/notifications/notification-dispatch.service';
import { NotificationSimulatorService } from '../../src/notifications/notification-simulator.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '10000000-0000-4000-8000-000000000002';
const BRANCH_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_BRANCH_ID = '20000000-0000-4000-8000-000000000002';
const SESSION_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_SESSION_ID = '30000000-0000-4000-8000-000000000009';
const FIXTURE_USER_ID = '30000000-0000-4000-8000-000000000010';
const TEACHER_ID = '40000000-0000-4000-8000-000000000002';
const TEACHER_BRANCH_ID = '40000000-0000-4000-8000-000000000003';
const STUDENT_ID = '40000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '50000000-0000-4000-8000-000000000001';
const COURSE_ID = '50000000-0000-4000-8000-000000000002';
const GROUP_ID = '50000000-0000-4000-8000-000000000003';
const TIME_SLOT_ID = '50000000-0000-4000-8000-000000000004';
const ROOM_ID = '50000000-0000-4000-8000-000000000005';
const SCHEDULE_ID = '60000000-0000-4000-8000-000000000001';
const VERSION_ID = '60000000-0000-4000-8000-000000000002';
const EVENT_ID = '60000000-0000-4000-8000-000000000003';
const SESSION_DATE = '2026-10-05';
const OTHER_SESSION_DATE = '2026-10-06';

const ctx = { tenantId: TENANT_ID, branchId: BRANCH_ID } as RequestContext;

// NON-ACCEPTANCE SQL regression: session-local fixtures, never a genuine
// business/UI journey or notification delivery/pilot acceptance.
withPostgres('N2 real PostgreSQL bounded dispatch regressions', () => {
  let dataSource: DataSource;
  let repo: NotificationDispatchRepository;
  let service: NotificationDispatchService;
  const originalSimulatorMode = process.env.NOTIFICATION_SIMULATOR_MODE;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    try {
      await new CreateTenants1700000000002().up(runner);
      await new CreateAttendanceSessions1824000000000().up(runner);
      await new CreateKvkkConsents1700000000010().up(runner);
      await new CreateNotificationOutbox1829000000000().up(runner);
      await new AddNotificationSnapshot1860000000000().up(runner);
      await new AddNotificationDispatch1870000000000().up(runner);
    } finally {
      await runner.release();
    }
    repo = new NotificationDispatchRepository();
    delete process.env.NOTIFICATION_SIMULATOR_MODE;
    service = new NotificationDispatchService(
      dataSource,
      repo,
      new NotificationSimulatorService(),
    );
  });

  afterAll(async () => {
    if (originalSimulatorMode === undefined) {
      delete process.env.NOTIFICATION_SIMULATOR_MODE;
    } else {
      process.env.NOTIFICATION_SIMULATOR_MODE = originalSimulatorMode;
    }
    if (!dataSource?.isInitialized) return;
    await cleanup();
    await dataSource.destroy();
  });

  async function cleanup(): Promise<void> {
    await dataSource.query(
      `DELETE FROM notification_dispatch_receipts WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM notification_outbox WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM kvkk_consent_events WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM kvkk_consents WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM kvkk_consent_subjects WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM attendance_sessions WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM schedule_events WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `UPDATE schedules SET active_version_id = NULL WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM schedule_versions WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM schedules WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM teacher_branches WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM teachers WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM time_slots WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM student_groups WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(
      `DELETE FROM courses WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(`DELETE FROM users WHERE id = $1`, [FIXTURE_USER_ID]);
    await dataSource.query(
      `DELETE FROM branches WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_ID, OTHER_TENANT_ID]],
    );
    await dataSource.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [
      [TENANT_ID, OTHER_TENANT_ID],
    ]);
  }

  beforeEach(async () => {
    await cleanup();
    await dataSource.query(
      `INSERT INTO tenants (id, slug, name) VALUES ($1, 'n2-dispatch', 'N2 Dispatch') ON CONFLICT (slug) DO NOTHING`,
      [TENANT_ID],
    );
    await seedSessionFixture();
  });

  async function seedSessionFixture(): Promise<void> {
    await dataSource.query(
      `INSERT INTO branches (id, tenant_id, name, code, status)
       VALUES ($1, $2, 'N2 Dispatch Branch A', 'N2-DISP-A', 'active'),
              ($3, $2, 'N2 Dispatch Branch B', 'N2-DISP-B', 'active')`,
      [BRANCH_ID, TENANT_ID, OTHER_BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO users (id, email, credential_hash, full_name, status, token_version)
       VALUES ($1, 'n2-dispatch-teacher@example.test', 'x', 'N2 Dispatch Teacher', 'active', 1)`,
      [FIXTURE_USER_ID],
    );
    await dataSource.query(
      `INSERT INTO teachers (id, tenant_id, user_id, employee_code, first_name, last_name, status)
       VALUES ($1, $2, $3, 'N2-D-1', 'N2', 'Teacher', 'active')`,
      [TEACHER_ID, TENANT_ID, FIXTURE_USER_ID],
    );
    await dataSource.query(
      `INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id, status, effective_from)
       VALUES ($1, $2, $3, $4, 'active', CURRENT_DATE - INTERVAL '1 day')`,
      [TEACHER_BRANCH_ID, TENANT_ID, TEACHER_ID, BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO courses (id, tenant_id, name, code, status)
       VALUES ($1, $2, 'N2 Dispatch Course', 'N2-D-C', 'active')`,
      [COURSE_ID, TENANT_ID],
    );
    await dataSource.query(
      `INSERT INTO student_groups (id, tenant_id, branch_id, name, code, status)
       VALUES ($1, $2, $3, 'N2 Dispatch Group', 'N2-D-G', 'active')`,
      [GROUP_ID, TENANT_ID, BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO time_slots (id, tenant_id, branch_id, name, day_of_week, start_time, end_time, order_index, status)
       VALUES ($1, $2, $3, 'N2 Slot', 1, '10:00', '11:00', 1, 'active')`,
      [TIME_SLOT_ID, TENANT_ID, BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO schedules (id, tenant_id, branch_id, status, revision, effective_from, effective_to)
       VALUES ($1, $2, $3, 'published', 1, $4::date - INTERVAL '1 day', $4::date + INTERVAL '7 days')`,
      [SCHEDULE_ID, TENANT_ID, BRANCH_ID, SESSION_DATE],
    );
    await dataSource.query(
      `INSERT INTO schedule_versions (id, tenant_id, branch_id, schedule_id, version_no, status, validation_mode, validation_fingerprint, validated_revision, snapshot, published_at)
       VALUES ($1, $2, $3, $4, 1, 'published', 'FULL', 'n2-dispatch', 1, '{}'::jsonb, now())`,
      [VERSION_ID, TENANT_ID, BRANCH_ID, SCHEDULE_ID],
    );
    await dataSource.query(
      `UPDATE schedules SET active_version_id = $1, updated_at = now() WHERE id = $2`,
      [VERSION_ID, SCHEDULE_ID],
    );
    await dataSource.query(
      `INSERT INTO schedule_events (id, tenant_id, branch_id, schedule_id, version_id, teacher_id, teacher_branch_id, student_group_id, course_id, room_id, time_slot_id, day_of_week, start_time, end_time, time_slot_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, '10:00', '11:00', '{"label":"N2 Slot"}'::jsonb)`,
      [
        EVENT_ID,
        TENANT_ID,
        BRANCH_ID,
        SCHEDULE_ID,
        VERSION_ID,
        TEACHER_ID,
        TEACHER_BRANCH_ID,
        GROUP_ID,
        COURSE_ID,
        ROOM_ID,
        TIME_SLOT_ID,
      ],
    );
    await dataSource.query(
      `INSERT INTO attendance_sessions (id, tenant_id, branch_id, schedule_event_id, teacher_id, student_group_id, course_id, room_id, session_date, roster_snapshot, status, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::jsonb, 'locked', 1),
              ($11, $2, $12, $4, $5, $6, $7, $8, $13::date, $10::jsonb, 'locked', 1)`,
      [
        SESSION_ID,
        TENANT_ID,
        BRANCH_ID,
        EVENT_ID,
        TEACHER_ID,
        GROUP_ID,
        COURSE_ID,
        ROOM_ID,
        SESSION_DATE,
        JSON.stringify([STUDENT_ID]),
        OTHER_SESSION_ID,
        OTHER_BRANCH_ID,
        OTHER_SESSION_DATE,
      ],
    );
  }

  async function seedConsent(approved: boolean): Promise<void> {
    await dataSource.query(
      `INSERT INTO kvkk_consent_subjects (id, tenant_id, subject_type, subject_ref_id, status)
       VALUES ($1, $2, 'student', $3, 'active')`,
      [SUBJECT_ID, TENANT_ID, STUDENT_ID],
    );
    const rows: Array<[string, string, number, Date | null]> = [
      ['c-parent', 'parent_notification', 1, null],
      ['c-sms', 'sms_notification', 1, null],
    ];
    if (!approved) {
      rows.push(['c-parent-revoked', 'parent_notification', 2, new Date()]);
    }
    for (const [id, type, version, revokedAt] of rows) {
      await dataSource.query(
        `INSERT INTO kvkk_consents
           (id, tenant_id, subject_id, consent_type, status, version, granted_at, revoked_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7)`,
        [
          id,
          TENANT_ID,
          SUBJECT_ID,
          type,
          revokedAt ? 'revoked' : 'approved',
          version,
          revokedAt,
        ],
      );
    }
  }

  async function insertOutboxRow(
    status: string,
    dedupeKey: string,
    overrides: Record<string, unknown> = {},
    sessionId: string = SESSION_ID,
  ): Promise<string> {
    const rows = (await dataSource.query(
      `INSERT INTO notification_outbox
         (tenant_id, dedupe_key, event_type, student_id, session_id, channel,
          status, payload_masked, version, available_at, attempts, snapshot)
       VALUES ($1, $2, 'attendance.absent.locked', $3, $4, 'sms', $5, '{}', $6,
               COALESCE($7::timestamptz, now()), $8, $9::jsonb)
       RETURNING id`,
      [
        TENANT_ID,
        dedupeKey,
        STUDENT_ID,
        sessionId,
        status,
        (overrides.version as number) ?? 0,
        (overrides.availableAt as Date | null) ?? null,
        (overrides.attempts as number) ?? 0,
        JSON.stringify(
          (overrides.snapshot as Record<string, unknown>) ?? {
            source: { sessionRef: 'p1:session:abc', studentRef: 'p1:student:def' },
            contact: { channel: 'sms', maskedDisplay: null, verificationStatus: null },
            consent: { approved: true, reason: null, consentId: 'c-parent', consentVersion: 1 },
            template: {
              eventType: 'attendance.absent.locked',
              channel: 'sms',
              templateRef: 'attendance.absent.locked:sms',
            },
            enqueuedAt: '2026-10-05T12:00:00.000Z',
          },
        ),
      ],
    )) as Array<{ id: string }>;
    return rows[0].id;
  }

  describe('migration postconditions', () => {
    it('adds claim/lease/fencing columns with expected types', async () => {
      const cols = (await dataSource.query(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_name = 'notification_outbox'
            AND column_name IN ('claim_token', 'claimed_at', 'claim_expires_at',
                                'fencing_token', 'cancelled_at', 'dead_lettered_at',
                                'last_error_code')
          ORDER BY column_name`,
      )) as Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>;
      expect(cols.map((c) => c.column_name)).toEqual([
        'cancelled_at',
        'claim_expires_at',
        'claim_token',
        'claimed_at',
        'dead_lettered_at',
        'fencing_token',
        'last_error_code',
      ]);
      const fencing = cols.find((c) => c.column_name === 'fencing_token')!;
      expect(fencing.data_type).toBe('integer');
      expect(fencing.is_nullable).toBe('NO');
      expect(fencing.column_default).toBe('0');
    });

    it('status CHECK includes dead_lettered, uncertain and cancelled', async () => {
      const constraints = (await dataSource.query(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint WHERE conname = 'chk_notification_outbox_status'`,
      )) as Array<{ def: string }>;
      expect(constraints).toHaveLength(1);
      for (const status of ['dead_lettered', 'uncertain', 'cancelled']) {
        expect(constraints[0].def).toContain(status);
      }
    });

    it('receipts table has UNIQUE (outbox_id, attempt) and simulated CHECK = true', async () => {
      const unique = (await dataSource.query(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = 'notification_dispatch_receipts'::regclass
            AND contype = 'u'`,
      )) as Array<{ def: string }>;
      expect(unique[0].def).toContain('outbox_id');
      expect(unique[0].def).toContain('attempt');

      const checks = (await dataSource.query(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = 'notification_dispatch_receipts'::regclass
            AND contype = 'c'
          ORDER BY conname`,
      )) as Array<{ def: string }>;
      const simulated = checks.find((c) => c.def.includes('simulated'));
      expect(simulated?.def).toContain('true');
      const outcome = checks.find((c) => c.def.includes('outcome'));
      expect(outcome?.def).toContain('provider_accepted');
      expect(outcome?.def).toContain('provider_rejected');
      expect(outcome?.def).toContain('uncertain');
    });

    it('rejects simulated=false receipts (fail-closed: no real delivery claims)', async () => {
      const outboxId = await insertOutboxRow('dispatched', 'dedupe-simfalse');
      await expect(
        dataSource.query(
          `INSERT INTO notification_dispatch_receipts
             (tenant_id, outbox_id, attempt, fencing_token, outcome, simulated, receipt)
           VALUES ($1, $2, 1, 1, 'provider_accepted', false, '{}')`,
          [TENANT_ID, outboxId],
        ),
      ).rejects.toThrow();
    });

    it('rejects duplicate (outbox_id, attempt) receipt (idempotency constraint)', async () => {
      const outboxId = await insertOutboxRow('dispatched', 'dedupe-dup');
      const insert = `INSERT INTO notification_dispatch_receipts
             (tenant_id, outbox_id, attempt, fencing_token, outcome, simulated, receipt)
           VALUES ($1, $2, 1, 1, 'provider_accepted', true, '{}')`;
      await dataSource.query(insert, [TENANT_ID, outboxId]);
      await expect(dataSource.query(insert, [TENANT_ID, outboxId])).rejects.toThrow();
    });

    it('rejects unknown status values (CHECK)', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO notification_outbox
             (tenant_id, dedupe_key, event_type, student_id, session_id, channel, status, payload_masked, version)
           VALUES ($1, 'bad-status', 'attendance.absent.locked', $2, $3, 'sms', 'exploded', '{}', 0)`,
          [TENANT_ID, STUDENT_ID, SESSION_ID],
        ),
      ).rejects.toThrow();
    });
  });

  describe('claim (lease + fencing)', () => {
    it('claims an approved row: attempts+1, fencing+1, lease set', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-claim');
      const claim = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(claim).not.toBeNull();
      expect(claim!.attempt).toBe(1);
      expect(claim!.fencingToken).toBe(1);
      expect(claim!.claimToken).toEqual(expect.any(String));

      const row = (await dataSource.query(
        `SELECT attempts, fencing_token, claim_token, claim_expires_at
           FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ attempts: number; fencing_token: number; claim_token: string; claim_expires_at: Date }>;
      expect(row[0].attempts).toBe(1);
      expect(row[0].fencing_token).toBe(1);
      expect(row[0].claim_token).toBe(claim!.claimToken);
      expect(new Date(row[0].claim_expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('second claim while lease active is rejected (0 rows)', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-lease');
      await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      const second = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(second).toBeNull();
    });

    it('expired lease can be reclaimed with a higher fencing token', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-expire');
      const first = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      await dataSource.query(
        `UPDATE notification_outbox SET claim_expires_at = now() - interval '1 second' WHERE id = $1`,
        [id],
      );
      const second = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(second).not.toBeNull();
      expect(second!.fencingToken).toBe(first!.fencingToken + 1);
      expect(second!.claimToken).not.toBe(first!.claimToken);
      expect(second!.attempt).toBe(2);
    });

    it('never claims pending/blocked_consent rows (drafts go through approve)', async () => {
      for (const status of ['pending', 'blocked_consent', 'cancelled', 'closed', 'dead_lettered', 'uncertain']) {
        const id = await insertOutboxRow(status, `dedupe-no-${status}`);
        const claim = await dataSource.transaction((em) =>
          repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
        );
        expect(claim).toBeNull();
      }
    });

    it('does not claim rows from other tenants (tenant predicate)', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-tenant');
      const claim = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: OTHER_TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(claim).toBeNull();
    });

    it('does not claim rows from other branches (branch predicate)', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-branch');
      const claim = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: OTHER_BRANCH_ID, id }),
      );
      expect(claim).toBeNull();
      const row = (await dataSource.query(
        `SELECT attempts, fencing_token, claim_token FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ attempts: number; fencing_token: number; claim_token: string | null }>;
      expect(row[0].attempts).toBe(0);
      expect(row[0].fencing_token).toBe(0);
      expect(row[0].claim_token).toBeNull();
    });
  });

  describe('applyOutcome (state machine)', () => {
    type ClaimRow = NonNullable<
      Awaited<ReturnType<NotificationDispatchRepository['claim']>>
    >;
    async function claimRow(id: string): Promise<ClaimRow> {
      const claim = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(claim).not.toBeNull();
      return claim!;
    }

    it('provider_accepted → dispatched with claim released and dispatched_at set', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-accept');
      const claim = await claimRow(id);
      const next = await dataSource.transaction((em) =>
        repo.applyOutcome(em, {
          tenantId: TENANT_ID,
          id,
          claimToken: claim.claimToken,
          outcome: 'provider_accepted',
          attempts: claim.attempt,
          errorCode: null,
        }),
      );
      expect(next).toEqual({ status: 'dispatched', version: 2 });
      const row = (await dataSource.query(
        `SELECT status, claim_token, dispatched_at FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string; claim_token: string | null; dispatched_at: Date }>;
      expect(row[0].status).toBe('dispatched');
      expect(row[0].claim_token).toBeNull();
      expect(row[0].dispatched_at).not.toBeNull();
    });

    it('provider_rejected below MAX_ATTEMPTS → failed with exponential backoff', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-fail1');
      const claim = await claimRow(id);
      const next = await dataSource.transaction((em) =>
        repo.applyOutcome(em, {
          tenantId: TENANT_ID,
          id,
          claimToken: claim.claimToken,
          outcome: 'provider_rejected',
          attempts: claim.attempt,
          errorCode: 'SIMULATED_REJECTION',
        }),
      );
      expect(next!.status).toBe('failed');
      const row = (await dataSource.query(
        `SELECT status, available_at, last_error_code FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string; available_at: Date; last_error_code: string }>;
      const delayMs = new Date(row[0].available_at).getTime() - Date.now();
      expect(row[0].status).toBe('failed');
      expect(row[0].last_error_code).toBe('SIMULATED_REJECTION');
      expect(delayMs).toBeGreaterThan(0);
      expect(delayMs).toBeLessThanOrEqual(backoffMsForAttempts(1) + 2_000);

      const blocked = await dataSource.transaction((em) =>
        repo.claim(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(blocked).toBeNull();
    });

    it('provider_rejected at MAX_ATTEMPTS → dead_lettered', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-fail3', { attempts: 2 });
      const claim = await claimRow(id);
      expect(claim!.attempt).toBe(3);
      const next = await dataSource.transaction((em) =>
        repo.applyOutcome(em, {
          tenantId: TENANT_ID,
          id,
          claimToken: claim.claimToken,
          outcome: 'provider_rejected',
          attempts: claim.attempt,
          errorCode: 'SIMULATED_REJECTION',
        }),
      );
      expect(next!.status).toBe('dead_lettered');
      const row = (await dataSource.query(
        `SELECT status, dead_lettered_at, attempts FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string; dead_lettered_at: Date; attempts: number }>;
      expect(row[0].status).toBe('dead_lettered');
      expect(row[0].dead_lettered_at).not.toBeNull();
      expect(row[0].attempts).toBe(3);
    });

    it('uncertain outcome → uncertain status (no delivery claim)', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-uncertain');
      const claim = await claimRow(id);
      const next = await dataSource.transaction((em) =>
        repo.applyOutcome(em, {
          tenantId: TENANT_ID,
          id,
          claimToken: claim.claimToken,
          outcome: 'uncertain',
          attempts: claim.attempt,
          errorCode: null,
        }),
      );
      expect(next!.status).toBe('uncertain');
      const row = (await dataSource.query(
        `SELECT status, dispatched_at FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string; dispatched_at: Date | null }>;
      expect(row[0].status).toBe('uncertain');
      expect(row[0].dispatched_at).toBeNull();
    });

    it('stale claim token cannot apply outcome (fencing)', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-stale');
      const first = await claimRow(id);
      await dataSource.query(
        `UPDATE notification_outbox SET claim_expires_at = now() - interval '1 second' WHERE id = $1`,
        [id],
      );
      await claimRow(id);
      const stale = await dataSource.transaction((em) =>
        repo.applyOutcome(em, {
          tenantId: TENANT_ID,
          id,
          claimToken: first.claimToken,
          outcome: 'provider_accepted',
          attempts: first.attempt,
          errorCode: null,
        }),
      );
      expect(stale).toBeNull();
      const row = (await dataSource.query(
        `SELECT status FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string }>;
      expect(row[0].status).toBe('approved');
    });

    it('outcome applied after cancel race is rejected (cancel wins, zero effect)', async () => {
      const id = await insertOutboxRow('approved', 'dedupe-cancel-race');
      const claim = await claimRow(id);
      const cancelled = await dataSource.transaction((em) =>
        repo.cancel(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(cancelled).toEqual({ status: 'cancelled', version: 2 });
      const applied = await dataSource.transaction((em) =>
        repo.applyOutcome(em, {
          tenantId: TENANT_ID,
          id,
          claimToken: claim.claimToken,
          outcome: 'provider_accepted',
          attempts: claim.attempt,
          errorCode: null,
        }),
      );
      expect(applied).toBeNull();
      const receipts = (await dataSource.query(
        `SELECT count(*)::int AS n FROM notification_dispatch_receipts WHERE outbox_id = $1`,
        [id],
      )) as Array<{ n: number }>;
      expect(receipts[0].n).toBe(0);
      const row = (await dataSource.query(
        `SELECT status FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string }>;
      expect(row[0].status).toBe('cancelled');
    });
  });

  describe('retry + cancel guards', () => {
    it('retry rearms dead_lettered preserving attempts', async () => {
      const id = await insertOutboxRow('dead_lettered', 'dedupe-retry', { attempts: 3 });
      const next = await dataSource.transaction((em) =>
        repo.rearmForRetry(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(next).toEqual({ status: 'approved', version: 1 });
      const row = (await dataSource.query(
        `SELECT status, attempts FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string; attempts: number }>;
      expect(row[0].attempts).toBe(3);
    });

    it('retry rejects dispatched rows', async () => {
      const id = await insertOutboxRow('dispatched', 'dedupe-retry-no');
      const next = await dataSource.transaction((em) =>
        repo.rearmForRetry(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(next).toBeNull();
    });

    it('cancel rejects dispatched rows', async () => {
      const id = await insertOutboxRow('dispatched', 'dedupe-cancel-no');
      const next = await dataSource.transaction((em) =>
        repo.cancel(em, { tenantId: TENANT_ID, branchId: BRANCH_ID, id }),
      );
      expect(next).toBeNull();
    });

    it('retry and cancel cannot touch rows from other branches', async () => {
      const retryId = await insertOutboxRow('dead_lettered', 'dedupe-retry-branch', { attempts: 3 });
      const retried = await dataSource.transaction((em) =>
        repo.rearmForRetry(em, { tenantId: TENANT_ID, branchId: OTHER_BRANCH_ID, id: retryId }),
      );
      expect(retried).toBeNull();
      const cancelId = await insertOutboxRow('approved', 'dedupe-cancel-branch');
      const cancelled = await dataSource.transaction((em) =>
        repo.cancel(em, { tenantId: TENANT_ID, branchId: OTHER_BRANCH_ID, id: cancelId }),
      );
      expect(cancelled).toBeNull();
      const rows = (await dataSource.query(
        `SELECT id, status FROM notification_outbox WHERE id = ANY($1::uuid[])`,
        [[retryId, cancelId]],
      )) as Array<{ id: string; status: string }>;
      const statusById = new Map(rows.map((row) => [row.id, row.status]));
      expect(statusById.get(retryId)).toBe('dead_lettered');
      expect(statusById.get(cancelId)).toBe('approved');
    });
  });

  describe('NotificationDispatchService end-to-end (real PostgreSQL)', () => {
    it('approved + consent granted → dispatched with durable simulated receipt', async () => {
      await seedConsent(true);
      const id = await insertOutboxRow('approved', 'dedupe-e2e-ok');

      const result = await service.execute(ctx, id);

      expect(result.status).toBe('dispatched');
      expect(result.idempotent).toBe(false);
      expect(result.receipt).not.toBeNull();
      expect(result.receipt!.simulated).toBe(true);
      expect(result.receipt!.outcome).toBe('provider_accepted');
      expect(result.receipt!.providerRef).toBe(`sim:${id}:1`);

      const stored = (await dataSource.query(
        `SELECT simulated, outcome, receipt FROM notification_dispatch_receipts WHERE outbox_id = $1`,
        [id],
      )) as Array<{ simulated: boolean; outcome: string; receipt: Record<string, unknown> }>;
      expect(stored).toHaveLength(1);
      expect(stored[0].simulated).toBe(true);
      expect(stored[0].receipt.simulated).toBe(true);
      expect(stored[0].receipt.attempt).toBe(1);
      expect(JSON.stringify(stored[0].receipt)).not.toContain(STUDENT_ID);
    });

    it('second execute on dispatched row is idempotent (same receipt, no new effect)', async () => {
      await seedConsent(true);
      const id = await insertOutboxRow('approved', 'dedupe-e2e-idem');

      const first = await service.execute(ctx, id);
      const second = await service.execute(ctx, id);

      expect(second.idempotent).toBe(true);
      expect(second.receipt!.id).toBe(first.receipt!.id);
      const count = (await dataSource.query(
        `SELECT count(*)::int AS n FROM notification_dispatch_receipts WHERE outbox_id = $1`,
        [id],
      )) as Array<{ n: number }>;
      expect(count[0].n).toBe(1);
      const row = (await dataSource.query(
        `SELECT attempts FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ attempts: number }>;
      expect(row[0].attempts).toBe(1);
    });

    it('consent revoked at dispatch → blocked_consent with zero receipts', async () => {
      await seedConsent(false);
      const id = await insertOutboxRow('approved', 'dedupe-e2e-revoked');

      const result = await service.execute(ctx, id);

      expect(result.status).toBe('blocked_consent');
      expect(result.reason).toBe('blocked_consent');
      expect(result.receipt).toBeNull();
      const receipts = (await dataSource.query(
        `SELECT count(*)::int AS n FROM notification_dispatch_receipts WHERE outbox_id = $1`,
        [id],
      )) as Array<{ n: number }>;
      expect(receipts[0].n).toBe(0);
      const row = (await dataSource.query(
        `SELECT status, reason, consent_version FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string; reason: string; consent_version: number }>;
      expect(row[0].status).toBe('blocked_consent');
      expect(row[0].reason).toBe('blocked_consent');
      expect(row[0].consent_version).toBe(2);
    });

    it('fail_first mode: rejection schedules backoff, then acceptance dispatches (attempt 2)', async () => {
      await seedConsent(true);
      process.env.NOTIFICATION_SIMULATOR_MODE = 'fail_first:1';
      const failingService = new NotificationDispatchService(
        dataSource,
        repo,
        new NotificationSimulatorService(),
      );
      delete process.env.NOTIFICATION_SIMULATOR_MODE;

      const id = await insertOutboxRow('approved', 'dedupe-e2e-backoff');
      const first = await failingService.execute(ctx, id);
      expect(first.status).toBe('failed');
      expect(first.receipt!.outcome).toBe('provider_rejected');

      const blocked = await failingService.execute(ctx, id);
      expect(blocked).toBeInstanceOf(ConflictException);

      await dataSource.query(
        `UPDATE notification_outbox SET available_at = now() - interval '1 second' WHERE id = $1`,
        [id],
      );
      const second = await failingService.execute(ctx, id);
      expect(second.status).toBe('dispatched');
      expect(second.attempt).toBe(2);
      expect(second.receipt!.attempt).toBe(2);

      const receipts = (await dataSource.query(
        `SELECT attempt, outcome FROM notification_dispatch_receipts
          WHERE outbox_id = $1 ORDER BY attempt ASC`,
        [id],
      )) as Array<{ attempt: number; outcome: string }>;
      expect(receipts).toEqual([
        { attempt: 1, outcome: 'provider_rejected' },
        { attempt: 2, outcome: 'provider_accepted' },
      ]);
    });

    it('pending row is not dispatchable until approved (server state machine)', async () => {
      await seedConsent(true);
      const id = await insertOutboxRow('pending', 'dedupe-e2e-chain');

      await expect(service.execute(ctx, id)).rejects.toThrow(ConflictException);

      await dataSource.query(
        `UPDATE notification_outbox SET status = 'approved', version = version + 1 WHERE id = $1`,
        [id],
      );
      const result = await service.execute(ctx, id);
      expect(result.status).toBe('dispatched');
    });

    it('execute from another branch context is rejected without touching the row (branch predicate)', async () => {
      await seedConsent(true);
      const id = await insertOutboxRow('approved', 'dedupe-e2e-branch');
      const otherBranchCtx = {
        tenantId: TENANT_ID,
        branchId: OTHER_BRANCH_ID,
      } as RequestContext;

      await expect(service.execute(otherBranchCtx, id)).rejects.toThrow(ForbiddenException);

      const row = (await dataSource.query(
        `SELECT status, attempts, claim_token FROM notification_outbox WHERE id = $1`,
        [id],
      )) as Array<{ status: string; attempts: number; claim_token: string | null }>;
      expect(row[0].status).toBe('approved');
      expect(row[0].attempts).toBe(0);
      expect(row[0].claim_token).toBeNull();
      const receipts = (await dataSource.query(
        `SELECT count(*)::int AS n FROM notification_dispatch_receipts WHERE outbox_id = $1`,
        [id],
      )) as Array<{ n: number }>;
      expect(receipts[0].n).toBe(0);
    });
  });

  describe('list (findAll) pagination & branch scoping', () => {
    async function insertWithCreatedAt(
      status: string,
      dedupeKey: string,
      createdAt: Date,
      sessionId: string = SESSION_ID,
    ): Promise<string> {
      const id = await insertOutboxRow(status, dedupeKey, {}, sessionId);
      await dataSource.query(
        `UPDATE notification_outbox SET created_at = $2 WHERE id = $1`,
        [id, createdAt],
      );
      return id;
    }

    it('paginates without a status filter (LIMIT/OFFSET indices stay bigint)', async () => {
      const a1 = await insertWithCreatedAt(
        'pending',
        'list-a1',
        new Date('2026-10-05T10:00:01.000Z'),
      );
      const a2 = await insertWithCreatedAt(
        'approved',
        'list-a2',
        new Date('2026-10-05T10:00:02.000Z'),
      );
      const a3 = await insertWithCreatedAt(
        'dispatched',
        'list-a3',
        new Date('2026-10-05T10:00:03.000Z'),
      );
      const otherBranchId = await insertWithCreatedAt(
        'pending',
        'list-other-branch',
        new Date('2026-10-05T10:00:04.000Z'),
        OTHER_SESSION_ID,
      );

      const all = await dataSource.transaction((em) =>
        repo.findAll(em, ctx, { limit: 100, offset: 0 }),
      );
      expect(all.map((r) => r.id)).toEqual([a3, a2, a1]);
      expect(all.map((r) => r.id)).not.toContain(otherBranchId);

      const page = await dataSource.transaction((em) =>
        repo.findAll(em, ctx, { limit: 2, offset: 1 }),
      );
      expect(page.map((r) => r.id)).toEqual([a2, a1]);
    });

    it('filters by status without shifting LIMIT onto the status parameter', async () => {
      const a1 = await insertWithCreatedAt(
        'pending',
        'status-a1',
        new Date('2026-10-05T10:01:01.000Z'),
      );
      const a2 = await insertWithCreatedAt(
        'approved',
        'status-a2',
        new Date('2026-10-05T10:01:02.000Z'),
      );

      const pending = await dataSource.transaction((em) =>
        repo.findAll(em, ctx, { limit: 100, offset: 0, status: 'pending' }),
      );
      const approved = await dataSource.transaction((em) =>
        repo.findAll(em, ctx, { limit: 100, offset: 0, status: 'approved' }),
      );
      expect(pending.map((r) => r.id)).toEqual([a1]);
      expect(pending.map((r) => r.status)).toEqual(['pending']);
      expect(approved.map((r) => r.id)).toEqual([a2]);
      expect(approved.map((r) => r.status)).toEqual(['approved']);
    });
  });
});

describe('N2 dispatch branch scope pre-storage denial', () => {
  const dispatchRepo = new NotificationDispatchRepository();
  const query = jest.fn();
  const em = { query } as unknown as EntityManager;
  const base = { tenantId: TENANT_ID, id: SESSION_ID };

  beforeEach(() => query.mockClear());

  const cases = [
    { name: 'claim', run: () => dispatchRepo.claim(em, { ...base, branchId: '' } as never) },
    {
      name: 'currentClaimBasis',
      run: () => dispatchRepo.currentClaimBasis(em, { ...base, branchId: undefined } as never),
    },
    {
      name: 'rearmForRetry',
      run: () => dispatchRepo.rearmForRetry(em, { ...base, branchId: ' ' } as never),
    },
    { name: 'cancel', run: () => dispatchRepo.cancel(em, { ...base, branchId: undefined } as never) },
  ];

  it.each(cases)('$name rejects missing branch scope before query', async ({ run }) => {
    await expect(run()).rejects.toThrow('NOTIFICATION_OUTBOX_SCOPE_REQUIRED');
    expect(query).not.toHaveBeenCalled();
  });
});
