import { DataSource } from 'typeorm';

import { AuditLogRepository } from '../../src/common/audit/audit-log.repository';
import { TypeOrmTransactionalAuditWriter } from '../../src/common/audit/transactional-audit-writer';
import { RequestContext } from '../../src/common/context/request-context';
import { DailyOperationsRepository } from '../../src/daily-operations/daily-operations.repository';
import { TransactionalLeaveAuditAdapter } from '../../src/leaves/leave-audit.adapter';
import { LeaveSelfDecisionException, LeaveStaleVersionException } from '../../src/leaves/leave-errors';
import { LeaveIdentityService } from '../../src/leaves/leave-identity.service';
import { LeaveCoverageStatus, LeaveDecisionStatus, LeaveDurationType, LeaveReasonCode, LeaveRequest } from '../../src/leaves/leave-request.entity';
import { LeaveRepository } from '../../src/leaves/leave.repository';
import { LeaveService } from '../../src/leaves/leave.service';
import { leaveEtag } from '../../src/daily-operations/leave-impact.types';
import { ScheduleEvent } from '../../src/schedules/schedule-event.entity';
import { ScheduleVersion } from '../../src/schedules/schedule-version.entity';
import { Schedule } from '../../src/schedules/schedule.entity';
import { ScheduleService } from '../../src/schedules/schedule.service';
import { TeacherRepository } from '../../src/teachers/teacher.repository';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

// UUID'ler yalnız [0-9a-f] içerir (t/g/r/s/u gibi harfler GEÇERSİZ).
const TENANT = 'a0000000-0000-4000-8000-0000000000a1';
const BRANCH = 'a1000000-0000-4000-8000-0000000000a1';
const MANAGER_USER = 'a3000000-0000-4000-8000-0000000000c1';
const TEACHER_USER = 'a3000000-0000-4000-8000-0000000000c2';
const SUBSTITUTE_USER = 'a3000000-0000-4000-8000-0000000000c3';
const TEACHER = 'c1000000-0000-4000-8000-0000000000c1';
const SUBSTITUTE = 'c1000000-0000-4000-8000-0000000000c2';
const TEACHER_BRANCH = 'cb000000-0000-4000-8000-0000000000c1';
const SUBSTITUTE_BRANCH = 'cb000000-0000-4000-8000-0000000000c2';
const GROUP = 'd1000000-0000-4000-8000-0000000000c1';
const COURSE = 'e1000000-0000-4000-8000-0000000000c1';
const TEACHER_COURSE = 'e2000000-0000-4000-8000-0000000000c1';
const ROOM = 'f1000000-0000-4000-8000-0000000000c1';
const SLOT = 'a2000000-0000-4000-8000-0000000000c1';

const managerCtx: RequestContext = {
  requestId: 'r1-approve-manager',
  tenantId: TENANT,
  user: {
    userId: MANAGER_USER,
    tenantId: TENANT,
    roleIds: ['manager'],
    permissions: ['leave:approve'],
  },
};

function ctxFor(userId: string, requestId: string): RequestContext {
  return {
    requestId,
    tenantId: TENANT,
    user: { userId, tenantId: TENANT, roleIds: ['teacher'], permissions: ['leave:approve'] },
  };
}

/**
 * R1 (#263) — onay yolu GERÇEK PostgreSQL'de.
 *
 * Kabul sözleşmesi: bu dosya iş sonucu (onaylı izin, projeksiyon, görevlendirme)
 * SQL ile ÜRETMEZ. Yalnız referans veri (kurum/şube/kullanıcı/öğretmen/ders/oda/
 * sınıf/zaman dilimi) SQL ile ekilir; program `ScheduleService` ile yayınlanır,
 * izin `LeaveRepository.create` ile açılır ve karar `LeaveService.decide` ile
 * verilir. Böylece onaylı izin yalnız gerçek işlemsel yoldan doğar.
 */
describeWithPostgres('R1 leave decision transaction on PostgreSQL (#263)', () => {
  jest.setTimeout(60_000);

  let dataSource: DataSource;
  let leaveService: LeaveService;
  let leaveRepository: LeaveRepository;
  let scheduleService: ScheduleService;
  let impactEngine: DailyOperationsRepository;

  const tenantScopedTables = [
    'daily_operation_lessons', 'leave_outbox_events', 'leave_requests', 'schedule_events',
    'schedule_versions', 'schedules', 'audit_logs', 'teacher_courses', 'teacher_branches',
    'teachers', 'student_groups', 'courses', 'rooms', 'time_slots', 'tenant_memberships',
    'branches',
  ] as const;

  async function cleanup(): Promise<void> {
    for (const table of tenantScopedTables) {
      await dataSource.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [TENANT]);
    }
    await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
      [MANAGER_USER, TEACHER_USER, SUBSTITUTE_USER],
    ]);
    await dataSource.query('DELETE FROM tenants WHERE id = $1', [TENANT]);
  }

  /**
   * Yalnız REFERANS veri ekilir (kurum/şube/kullanıcı/öğretmen/ders/oda/sınıf/
   * zaman dilimi/uygunluk). İş sonucu (onaylı izin, projeksiyon, görevlendirme)
   * SQL ile ÜRETİLMEZ; yalnız gerçek işlemsel yoldan doğar.
   */
  async function seedReferences(): Promise<void> {
    const statements: Array<[string, unknown[]]> = [
      [`INSERT INTO tenants (id, name, slug, status, timezone, deleted_at) VALUES ($1, 'R1 Karar Kurumu', 'r1-decision-tenant', 'active', 'Europe/Istanbul', NULL)`, [TENANT]],
      [`INSERT INTO branches (id, tenant_id, name, code, status, deleted_at) VALUES ($1, $2, 'Merkez Şube', 'r1-branch', 'active', NULL)`, [BRANCH, TENANT]],
      [`INSERT INTO users (id, email, credential_hash, full_name, status, deleted_at) VALUES ($1, 'r1-manager@example.test', 'not-a-real-credential-hash', 'Mert Yönetici', 'active', NULL)`, [MANAGER_USER]],
      [`INSERT INTO users (id, email, credential_hash, full_name, status, deleted_at) VALUES ($1, 'r1-teacher@example.test', 'not-a-real-credential-hash', 'Ayşe Yılmaz', 'active', NULL)`, [TEACHER_USER]],
      [`INSERT INTO users (id, email, credential_hash, full_name, status, deleted_at) VALUES ($1, 'r1-substitute@example.test', 'not-a-real-credential-hash', 'Zeynep Kaya', 'active', NULL)`, [SUBSTITUTE_USER]],
      [`INSERT INTO tenant_memberships (user_id, tenant_id, status, deleted_at) VALUES ($1, $2, 'active', NULL)`, [MANAGER_USER, TENANT]],
      [`INSERT INTO tenant_memberships (user_id, tenant_id, status, deleted_at) VALUES ($1, $2, 'active', NULL)`, [TEACHER_USER, TENANT]],
      [`INSERT INTO tenant_memberships (user_id, tenant_id, status, deleted_at) VALUES ($1, $2, 'active', NULL)`, [SUBSTITUTE_USER, TENANT]],
      [`INSERT INTO teachers (id, tenant_id, user_id, first_name, last_name, status, deleted_at) VALUES ($1, $2, $3, 'Ayşe', 'Yılmaz', 'active', NULL)`, [TEACHER, TENANT, TEACHER_USER]],
      [`INSERT INTO teachers (id, tenant_id, user_id, first_name, last_name, status, deleted_at) VALUES ($1, $2, $3, 'Zeynep', 'Kaya', 'active', NULL)`, [SUBSTITUTE, TENANT, SUBSTITUTE_USER]],
      [`INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id, status, effective_from, effective_to, deleted_at) VALUES ($1, $2, $3, $4, 'active', '2026-01-01', NULL, NULL)`, [TEACHER_BRANCH, TENANT, TEACHER, BRANCH]],
      [`INSERT INTO teacher_branches (id, tenant_id, teacher_id, branch_id, status, effective_from, effective_to, deleted_at) VALUES ($1, $2, $3, $4, 'active', '2026-01-01', NULL, NULL)`, [SUBSTITUTE_BRANCH, TENANT, SUBSTITUTE, BRANCH]],
      [`INSERT INTO courses (id, tenant_id, name, code, status, deactivated_at) VALUES ($1, $2, 'Matematik', 'r1-math', 'active', NULL)`, [COURSE, TENANT]],
      [`INSERT INTO rooms (id, tenant_id, branch_id, name, code, status, deactivated_at) VALUES ($1, $2, $3, 'Derslik 1', 'r1-room', 'active', NULL)`, [ROOM, TENANT, BRANCH]],
      [`INSERT INTO student_groups (id, tenant_id, branch_id, name, code, status, deleted_at) VALUES ($1, $2, $3, '5-A', 'r1-group', 'active', NULL)`, [GROUP, TENANT, BRANCH]],
      [`INSERT INTO time_slots (id, tenant_id, branch_id, name, day_of_week, start_time, end_time, status, archived_at) VALUES ($1, $2, $3, '1. Ders', 1, '09:00', '10:00', 'active', NULL)`, [SLOT, TENANT, BRANCH]],
      [`INSERT INTO teacher_courses (id, tenant_id, teacher_id, course_id, status, effective_from, effective_to) VALUES ($1, $2, $3, $4, 'active', '2026-01-01', NULL)`, [TEACHER_COURSE, TENANT, SUBSTITUTE, COURSE]],
    ];
    for (const [sql, params] of statements) {
      await dataSource.query(sql, params);
    }
  }

  /** Yayınlanmış program: gerçek `ScheduleService` yolundan yazılır. */
  async function publishSchedule(): Promise<void> {
    const draft = {
      eventId: 'e1',
      teacherId: TEACHER,
      teacherBranchId: TEACHER_BRANCH,
      studentGroupId: GROUP,
      courseId: COURSE,
      roomId: ROOM,
      timeSlotId: SLOT,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
    };
    const schedule = await scheduleService.createSchedule({
      tenantId: TENANT,
      branchId: BRANCH,
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    await scheduleService.saveDraft({
      tenantId: TENANT,
      branchId: BRANCH,
      scheduleId: schedule.id,
      events: [draft],
    });
    const persisted = await dataSource.query('SELECT revision FROM schedules WHERE id = $1', [schedule.id]);
    await scheduleService.publish(
      TENANT,
      BRANCH,
      schedule.id,
      MANAGER_USER,
      'r1-publish',
      [draft],
      Number(persisted[0].revision),
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
      entities: [Schedule, ScheduleVersion, ScheduleEvent, LeaveRequest],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    scheduleService = new ScheduleService(
      dataSource.getRepository(Schedule),
      dataSource.getRepository(ScheduleVersion),
      dataSource.getRepository(ScheduleEvent),
      { solve: async () => ({}) as never } as never,
    );
    const auditWriter = new TypeOrmTransactionalAuditWriter(new AuditLogRepository());
    impactEngine = new DailyOperationsRepository(dataSource, auditWriter);
    leaveRepository = new LeaveRepository(
      dataSource.getRepository(LeaveRequest),
      dataSource,
      new TransactionalLeaveAuditAdapter(auditWriter),
      impactEngine,
    );
    leaveService = new LeaveService(
      leaveRepository,
      new LeaveIdentityService({} as never, new TeacherRepository(dataSource)),
    );
  });

  beforeEach(async () => {
    await cleanup();
    await seedReferences();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await cleanup();
    await dataSource.destroy();
  });

  async function createPendingLeave(input: {
    requesterUserId?: string;
    teacherId?: string;
  } = {}): Promise<LeaveRequest> {
    return leaveRepository.create(ctxFor(TEACHER_USER, 'r1-create'), {
      tenantId: TENANT, branchId: BRANCH,
      teacherId: input.teacherId ?? TEACHER,
      requesterUserId: input.requesterUserId ?? TEACHER_USER,
      durationType: LeaveDurationType.FULL_DAY,
      reasonCode: LeaveReasonCode.ANNUAL_LEAVE,
      coverageStatus: LeaveCoverageStatus.NOT_REQUIRED,
      startsAt: new Date('2026-09-14T00:00:00.000Z'),
      endsAt: new Date('2026-09-28T20:00:00.000Z'),
    });
  }

  async function countRows(sql: string, params: unknown[]): Promise<number> {
    const rows = await dataSource.query(sql, params);
    return Number(rows[0].n);
  }

  it('approves with the server-computed impact, readable names and same-transaction rows', async () => {
    await publishSchedule();
    const leave = await createPendingLeave();

    const response = await leaveService.decide(
      managerCtx, leave.id, { decision: LeaveDecisionStatus.APPROVED }, leaveEtag(leave.id, leave.version),
    );

    // Okunabilir etki: ham UUID yok, adlar çözümlendi.
    expect(response.decisionLabel).toBe('Onaylandı');
    expect(response.summary).toContain('3 ders etkilendi');
    expect(response.impact).toMatchObject({
      coverageLabel: 'Karşılık bekliyor', impactedLessonCount: 3, zeroImpact: false,
    });
    expect(response.impact?.lessons.map((lesson) => lesson.lessonLabel)).toEqual([
      'Matematik · 5-A · 09:00–10:00 · 14.09.2026',
      'Matematik · 5-A · 09:00–10:00 · 21.09.2026',
      'Matematik · 5-A · 09:00–10:00 · 28.09.2026',
    ]);
    expect(response.impact?.lessons[0]).toMatchObject({
      courseLabel: 'Matematik',
      groupLabel: '5-A',
      roomLabel: 'Derslik 1',
      teacherLabel: 'Ayşe Yılmaz',
      stateLabel: 'Açık',
    });
    expect(response.impact?.candidates.finalized).toBe(true);
    expect(response.impact?.candidates.items).toEqual([
      { teacherLabel: 'Zeynep Kaya', branchLabel: 'Merkez Şube', availabilityLabel: 'Şu an uygun' },
    ]);

    const leaveRows = await dataSource.query('SELECT decision_status, coverage_status, version, decided_by_user_id FROM leave_requests WHERE id = $1', [leave.id]);
    expect(leaveRows[0]).toMatchObject({
      decision_status: 'approved', coverage_status: 'unresolved', version: 2, decided_by_user_id: MANAGER_USER,
    });

    const lessons = await dataSource.query(
      `SELECT state, coverage_status, occurrence_date::text AS occurrence
       FROM daily_operation_lessons WHERE leave_request_id = $1 ORDER BY occurrence_date`,
      [leave.id],
    );
    expect(lessons.map((row: any) => row.occurrence)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
    expect(lessons.every((row: any) => row.state === 'open' && row.coverage_status === 'unresolved')).toBe(true);

    const auditRows = await dataSource.query("SELECT action, metadata_json FROM audit_logs WHERE entity_id = $1 AND action = 'leave.approved.v1'", [leave.id]);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].metadata_json).toMatchObject({
      schemaVersion: 1, result: 'success',
      changedFields: ['status', 'coverageStatus', 'dailyOperationsProjection', 'version'],
    });

    const outboxRows = await dataSource.query('SELECT event_name, payload_json FROM leave_outbox_events WHERE leave_request_id = $1', [leave.id]);
    expect(outboxRows.map((row: any) => row.event_name).sort()).toEqual(['leave.approved.v1', 'leave.requested.v1']);
    expect(outboxRows.find((row: any) => row.event_name === 'leave.approved.v1').payload_json)
      .toMatchObject({ impactedLessonCount: 3, openLessonCount: 3, projectionPersisted: true });

    // KVKK: çözümlenen adlar audit/outbox'a sızmaz.
    const persisted = JSON.stringify([auditRows, outboxRows]);
    expect(persisted).not.toContain('Yılmaz');
    expect(persisted).not.toContain('Zeynep');
  });

  it('rolls back decision, projections, audit and outbox together when the audit insert fails', async () => {
    await publishSchedule();
    const leave = await createPendingLeave();
    const failingRepository = new LeaveRepository(
      dataSource.getRepository(LeaveRequest),
      dataSource,
      { write: async () => { throw new Error('forced audit failure'); } } as never,
      impactEngine,
    );

    await expect(
      failingRepository.decide(managerCtx, leave.id, {
        decision: LeaveDecisionStatus.APPROVED,
        decidedByUserId: MANAGER_USER,
        expectedVersion: leave.version,
      }),
    ).rejects.toThrow('forced audit failure');

    // Kısmi kayıt YOK: karar, projeksiyon, audit ve outbox birlikte geri alındı.
    const rolledBack = await dataSource.query('SELECT decision_status, coverage_status, version FROM leave_requests WHERE id = $1', [leave.id]);
    expect(rolledBack[0]).toMatchObject({
      decision_status: 'pending', coverage_status: 'not_required', version: 1,
    });
    expect(await countRows('SELECT COUNT(*)::int AS n FROM daily_operation_lessons WHERE leave_request_id = $1', [leave.id])).toBe(0);
    expect(await countRows("SELECT COUNT(*)::int AS n FROM audit_logs WHERE entity_id = $1 AND action = 'leave.approved.v1'", [leave.id])).toBe(0);
    expect(await countRows("SELECT COUNT(*)::int AS n FROM leave_outbox_events WHERE leave_request_id = $1 AND event_name = 'leave.approved.v1'", [leave.id])).toBe(0);
  });

  it('states a zero-impact approval explicitly without writing projections', async () => {
    const leave = await createPendingLeave({ teacherId: SUBSTITUTE, requesterUserId: SUBSTITUTE_USER });

    const response = await leaveService.decide(
      managerCtx,
      leave.id,
      { decision: LeaveDecisionStatus.APPROVED },
      leaveEtag(leave.id, leave.version),
    );

    expect(response.impact?.zeroImpact).toBe(true);
    expect(response.impact?.zeroImpactReason).toBe('NO_PUBLISHED_SCHEDULE_EVENT');
    expect(response.impact?.zeroImpactDetail).toContain('etkilenen ders yok');
    expect(response.impact?.impactedLessonCount).toBe(0);
    expect(response.impact?.coverageLabel).toBe('Karşılık gerekmiyor');
    expect(response.summary).toContain('etkilenen ders yok');
    expect(response.impactDetail).toContain('etkilenen ders yok');
    expect(await countRows('SELECT COUNT(*)::int AS n FROM daily_operation_lessons WHERE leave_request_id = $1', [leave.id])).toBe(0);

    const zeroImpactRows = await dataSource.query('SELECT decision_status, coverage_status FROM leave_requests WHERE id = $1', [leave.id]);
    expect(zeroImpactRows[0]).toMatchObject({ decision_status: 'approved', coverage_status: 'not_required' });
  });

  it('denies self-approval for the requester and for the affiliated teacher without writing rows', async () => {
    await publishSchedule();
    const ownLeave = await createPendingLeave();
    await expect(
      leaveService.decide(
        ctxFor(TEACHER_USER, 'r1-self-requester'),
        ownLeave.id,
        { decision: LeaveDecisionStatus.APPROVED },
        leaveEtag(ownLeave.id, ownLeave.version),
      ),
    ).rejects.toBeInstanceOf(LeaveSelfDecisionException);

    // Talep sahibi farklı ama aktör aynı öğretmen: kimlik çözümü reddi tetikler.
    const affiliatedLeave = await createPendingLeave({ requesterUserId: MANAGER_USER });
    await expect(
      leaveService.decide(
        ctxFor(TEACHER_USER, 'r1-self-affiliated'),
        affiliatedLeave.id,
        { decision: LeaveDecisionStatus.APPROVED },
        leaveEtag(affiliatedLeave.id, affiliatedLeave.version),
      ),
    ).rejects.toBeInstanceOf(LeaveSelfDecisionException);

    for (const id of [ownLeave.id, affiliatedLeave.id]) {
      const approved = await dataSource.query("SELECT id FROM leave_requests WHERE id = $1 AND decision_status = 'approved'", [id]);
      expect(approved).toHaveLength(0);
      expect(await countRows('SELECT COUNT(*)::int AS n FROM daily_operation_lessons WHERE leave_request_id = $1', [id])).toBe(0);
    }
  });

  it('recovers from a stale If-Match version without a partial write', async () => {
    await publishSchedule();
    const leave = await createPendingLeave();

    await expect(
      leaveService.decide(
        managerCtx,
        leave.id,
        { decision: LeaveDecisionStatus.APPROVED },
        leaveEtag(leave.id, leave.version + 1),
      ),
    ).rejects.toBeInstanceOf(LeaveStaleVersionException);

    const unchanged = await dataSource.query('SELECT decision_status, coverage_status, version FROM leave_requests WHERE id = $1', [leave.id]);
    expect(unchanged[0]).toMatchObject({ decision_status: 'pending', coverage_status: 'not_required', version: 1 });
    expect(await countRows('SELECT COUNT(*)::int AS n FROM daily_operation_lessons WHERE leave_request_id = $1', [leave.id])).toBe(0);

    // Doğru sürümle karar hâlâ verilebilir (kilitli kalan bir kayıt yok).
    const retried = await leaveService.decide(
      managerCtx, leave.id, { decision: LeaveDecisionStatus.APPROVED }, leaveEtag(leave.id, leave.version),
    );
    expect(retried.version).toBe(2);
    expect(retried.impact?.impactedLessonCount).toBe(3);
  });
});


