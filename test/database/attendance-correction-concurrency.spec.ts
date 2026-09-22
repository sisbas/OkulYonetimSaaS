import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AttendanceActor } from '../../src/attendance/attendance-access';
import { TransactionalAttendanceAuditAdapter } from '../../src/attendance/attendance-audit.adapter';
import { AttendanceSessionService } from '../../src/attendance/attendance-session.service';
import { AttendanceSession } from '../../src/attendance/attendance-session.entity';
import { AttendanceRecord } from '../../src/attendance/attendance.entity';
import { AuditLogRepository } from '../../src/common/audit/audit-log.repository';
import {
  TEST_AUDIT_HMAC_KEY,
  verifyAuditChain,
} from '../../src/common/audit/audit-chain';
import { TypeOrmTransactionalAuditWriter } from '../../src/common/audit/transactional-audit-writer';

/**
 * AC-7 (#265): GERÇEK PostgreSQL üzerinde kontrollü düzeltme eşzamanlılık kanıtı.
 *
 * İki paralel düzeltme aynı `expectedVersion` ile gelirse oturum satırındaki
 * `pessimistic_write` kilidi nedeniyle tam olarak BİRİ başarılı olmalı; diğeri
 * 409 çakışma almalı. Ayrıca her başarılı düzeltme için tam olarak bir durable
 * audit kaydı yazılmalı ve zincir geçerli kalmalı.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_ID = '10000000-0000-4000-8000-000000000266';
const BRANCH_ID = '20000000-0000-4000-8000-000000000266';
const MANAGER_ID = '30000000-0000-4000-8000-000000000266';
const TEACHER_USER_ID = '30000000-0000-4000-8000-000000000267';
const TEACHER_ID = '40000000-0000-4000-8000-000000000266';
const TEACHER_BRANCH_ID = '40000000-0000-4000-8000-000000000267';
const COURSE_ID = '50000000-0000-4000-8000-000000000266';
const ROOM_ID = '50000000-0000-4000-8000-000000000267';
const GROUP_ID = '50000000-0000-4000-8000-000000000268';
const TIME_SLOT_ID = '50000000-0000-4000-8000-000000000269';
const SCHEDULE_ID = '60000000-0000-4000-8000-000000000266';
const VERSION_ID = '60000000-0000-4000-8000-000000000267';
const EVENT_ID = '60000000-0000-4000-8000-000000000268';
const SESSION_ID = '70000000-0000-4000-8000-000000000266';
const STUDENT_ID = '80000000-0000-4000-8000-000000000266';
const SESSION_DATE = '2026-09-14';

const actor: AttendanceActor = {
  userId: MANAGER_ID,
  tenantId: TENANT_ID,
  roleIds: ['operations_manager'],
  teacherId: null,
  requestId: 'req-attendance-concurrency',
};

describeWithPostgres('attendance correction PostgreSQL concurrency (#265, AC-7)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;
  let service: AttendanceSessionService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [AttendanceSession, AttendanceRecord],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    service = new AttendanceSessionService(
      dataSource.getRepository(AttendanceSession),
      dataSource.getRepository(AttendanceRecord),
      new TransactionalAttendanceAuditAdapter(
        new TypeOrmTransactionalAuditWriter(new AuditLogRepository()),
      ),
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.destroy();
  });

  /**
   * Referans fixture'ı: yalnız var olan kayıtlar (tenant/branch/user/teacher/
   * course/room/group/time-slot/schedule/event) oluşturulur. İş sonucu
   * (düzeltme) SQL ile DEĞİL, servis çağrısıyla üretilir.
   */
  async function seedReferenceFixture(): Promise<void> {
    await dataSource.query('DELETE FROM audit_logs WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM attendance_records WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM attendance_sessions WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM schedule_events WHERE tenant_id = $1', [TENANT_ID]);
    // schedules.active_version_id -> schedule_versions FK'si: önce bağ koparılır.
    await dataSource.query('UPDATE schedules SET active_version_id = NULL WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM schedule_versions WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM schedules WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM teacher_branches WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM teachers WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM time_slots WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM student_groups WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM rooms WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM courses WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
      [MANAGER_ID, TEACHER_USER_ID],
    ]);
    await dataSource.query('DELETE FROM branches WHERE tenant_id = $1', [TENANT_ID]);
    await dataSource.query('DELETE FROM tenants WHERE id = $1', [TENANT_ID]);

    await dataSource.query(
      `INSERT INTO tenants (id, name, slug, status, timezone, deleted_at)
       VALUES ($1, 'Attendance Concurrency Tenant', 'attendance-concurrency', 'active', 'Europe/Istanbul', NULL)`,
      [TENANT_ID],
    );
    await dataSource.query(
      `INSERT INTO branches (id, tenant_id, name, code, status, deleted_at)
       VALUES ($1, $2, 'Attendance Concurrency Branch', 'ATT-CONCURRENCY', 'active', NULL)`,
      [BRANCH_ID, TENANT_ID],
    );
    await dataSource.query(
      `INSERT INTO users (id, email, credential_hash, full_name, status, token_version)
       VALUES ($1, 'attendance-manager@example.test', 'x', 'Attendance Manager', 'active', 1),
              ($2, 'attendance-teacher@example.test', 'x', 'Attendance Teacher', 'active', 1)`,
      [MANAGER_ID, TEACHER_USER_ID],
    );
    await dataSource.query(
      `INSERT INTO teachers (id, tenant_id, user_id, employee_code, first_name, last_name, status)
       VALUES ($1, $2, $3, 'ATT-T-1', 'Attendance', 'Teacher', 'active')`,
      [TEACHER_ID, TENANT_ID, TEACHER_USER_ID],
    );
    await dataSource.query(
      `INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id, status, effective_from, effective_to)
       VALUES ($1, $2, $3, $4, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)`,
      [TEACHER_BRANCH_ID, TENANT_ID, TEACHER_ID, BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO courses (id, tenant_id, name, code, status)
       VALUES ($1, $2, 'Attendance Concurrency Course', 'ATT-C-1', 'active')`,
      [COURSE_ID, TENANT_ID],
    );
    await dataSource.query(
      `INSERT INTO rooms (id, tenant_id, branch_id, name, code, capacity, status)
       VALUES ($1, $2, $3, 'Attendance Concurrency Room', 'ATT-R-1', 24, 'active')`,
      [ROOM_ID, TENANT_ID, BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO student_groups (id, tenant_id, branch_id, name, code, status)
       VALUES ($1, $2, $3, 'Attendance Concurrency Group', 'ATT-G-1', 'active')`,
      [GROUP_ID, TENANT_ID, BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO time_slots (id, tenant_id, branch_id, name, day_of_week, start_time, end_time, order_index, status)
       VALUES ($1, $2, $3, 'ATT Slot', 1, '10:00', '11:00', 1, 'active')`,
      [TIME_SLOT_ID, TENANT_ID, BRANCH_ID],
    );
    await dataSource.query(
      `INSERT INTO schedules (id, tenant_id, branch_id, status, revision, effective_from, effective_to)
       VALUES ($1, $2, $3, 'published', 1, $4::date - INTERVAL '1 day', $4::date + INTERVAL '7 days')`,
      [SCHEDULE_ID, TENANT_ID, BRANCH_ID, SESSION_DATE],
    );
    await dataSource.query(
      `INSERT INTO schedule_versions (id, tenant_id, branch_id, schedule_id, version_no, status, validation_mode, validation_fingerprint, validated_revision, snapshot, published_at)
       VALUES ($1, $2, $3, $4, 1, 'published', 'FULL', 'attendance-concurrency', 1, '{}'::jsonb, now())`,
      [VERSION_ID, TENANT_ID, BRANCH_ID, SCHEDULE_ID],
    );
    await dataSource.query(
      'UPDATE schedules SET active_version_id = $1, updated_at = now() WHERE id = $2',
      [VERSION_ID, SCHEDULE_ID],
    );
    await dataSource.query(
      `INSERT INTO schedule_events (id, tenant_id, branch_id, schedule_id, version_id, teacher_id, teacher_branch_id, student_group_id, course_id, room_id, time_slot_id, day_of_week, start_time, end_time, time_slot_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, '10:00', '11:00', '{"label":"ATT Slot"}'::jsonb)`,
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
      `INSERT INTO attendance_sessions (id, tenant_id, branch_id, schedule_event_id, teacher_id, student_group_id, course_id, room_id, session_date, roster_snapshot, status, version, locked_by_id, locked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::jsonb, 'locked', 1, $11, now())`,
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
        MANAGER_ID,
      ],
    );
    await dataSource.query(
      `INSERT INTO attendance_records (tenant_id, session_id, student_id, status, marked_by_id, notes, correction_count)
       VALUES ($1, $2, $3, 'absent', $4, NULL, 0)`,
      [TENANT_ID, SESSION_ID, STUDENT_ID, TEACHER_USER_ID],
    );
  }

  const correctionInput = {
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    status: 'excused' as never,
    reasonCode: 'excused_document' as never,
    expectedVersion: 1,
  };

  const recordRow = async () =>
    (await dataSource.query(
      'SELECT status, correction_count, correction_reason_code, corrected_by_id FROM attendance_records WHERE tenant_id = $1 AND session_id = $2',
      [TENANT_ID, SESSION_ID],
    ))[0] as {
      status: string;
      correction_count: number;
      correction_reason_code: string | null;
      corrected_by_id: string | null;
    };

  const sessionVersion = async () =>
    Number(
      (
        await dataSource.query(
          'SELECT version FROM attendance_sessions WHERE tenant_id = $1 AND id = $2',
          [TENANT_ID, SESSION_ID],
        )
      )[0].version,
    );

  const auditRows = async (action: string) =>
    (await dataSource.query(
      `SELECT seq, prev_hash, entry_hash, signature, signature_key_id, tenant_id, actor_user_id, actor_session_id, action, entity_type, entity_id, request_id, metadata_json, created_at
         FROM audit_logs WHERE tenant_id = $1 AND action = $2 ORDER BY seq ASC`,
      [TENANT_ID, action],
    )) as Array<Record<string, unknown>>;

  const toVerifiable = (row: Record<string, unknown>) => ({
    sequence: Number(row.seq),
    prevHash: row.prev_hash as string,
    entryHash: row.entry_hash as string,
    signature: row.signature as string,
    signatureKeyId: row.signature_key_id as string,
    payload: {
      tenantId: row.tenant_id as string,
      actorUserId: (row.actor_user_id ?? null) as string | null,
      actorSessionId: (row.actor_session_id ?? null) as string | null,
      action: row.action as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      requestId: row.request_id as string,
      metadataJson: row.metadata_json,
      createdAt: (row.created_at as Date).toISOString(),
    },
  });

  const chainForTenant = async () =>
    (await dataSource.query(
      `SELECT seq, prev_hash, entry_hash, signature, signature_key_id, tenant_id, actor_user_id, actor_session_id, action, entity_type, entity_id, request_id, metadata_json, created_at
         FROM audit_logs WHERE tenant_id = $1 ORDER BY seq ASC`,
      [TENANT_ID],
    )) as Array<Record<string, unknown>>;

  it('serializes two parallel corrections with the same expectedVersion (exactly one wins)', async () => {
    await seedReferenceFixture();

    const results = await Promise.allSettled([
      service.correctRecord(actor, { ...correctionInput, notes: 'parallel A' }),
      service.correctRecord(actor, { ...correctionInput, notes: 'parallel B' }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    // Tek düzeltme kalıcılaştı; sayaç ve version dizisi tutarlı.
    const row = await recordRow();
    expect(row.status).toBe('excused');
    expect(row.correction_count).toBe(1);
    expect(row.correction_reason_code).toBe('excused_document');
    expect(row.corrected_by_id).toBe(MANAGER_ID);
    expect(await sessionVersion()).toBe(2);

    // Tam olarak bir durable audit kaydı ve zincir bozulmamış.
    expect(await auditRows('attendance.record.corrected')).toHaveLength(1);
    expect(
      verifyAuditChain((await chainForTenant()).map(toVerifiable), TEST_AUDIT_HMAC_KEY),
    ).toMatchObject({ valid: true, reason: null });
  });

  it('appends one durable audit row per successful correction with evidence values', async () => {
    await seedReferenceFixture();

    await service.correctRecord(actor, correctionInput);
    await service.correctRecord(actor, {
      ...correctionInput,
      expectedVersion: 2,
      status: 'present' as never,
      reasonCode: 'late_arrival_update' as never,
    });

    const audit = await auditRows('attendance.record.corrected');
    expect(audit).toHaveLength(2);
    expect(audit[0].request_id).toBe('req-attendance-concurrency');

    const firstEvidence = (audit[0].metadata_json as { valueEvidence?: Record<string, unknown> })
      .valueEvidence;
    expect(firstEvidence).toMatchObject({
      reasonCode: 'excused_document',
      correctionCount: 1,
      previousStatus: 'absent',
      newStatus: 'excused',
    });

    const row = await recordRow();
    expect(row.correction_count).toBe(2);
    expect(await sessionVersion()).toBe(3);

    expect(
      verifyAuditChain((await chainForTenant()).map(toVerifiable), TEST_AUDIT_HMAC_KEY),
    ).toMatchObject({ valid: true, reason: null });
  });

  it('rejects a teacher-initiated correction on real data (separation of duties)', async () => {
    await seedReferenceFixture();

    const teacherActor: AttendanceActor = {
      userId: TEACHER_USER_ID,
      tenantId: TENANT_ID,
      roleIds: ['teacher'],
      teacherId: TEACHER_ID,
      requestId: 'req-attendance-concurrency-teacher',
    };

    await expect(service.correctRecord(teacherActor, correctionInput)).rejects.toThrow(
      /gözetim rolleri/,
    );

    const row = await recordRow();
    expect(row.correction_count).toBe(0);
    expect(row.status).toBe('absent');
    expect(await auditRows('attendance.record.corrected')).toHaveLength(0);
  });
});
