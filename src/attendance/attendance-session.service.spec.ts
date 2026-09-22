import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AttendanceSessionService,
  CreateSessionInput,
} from './attendance-session.service';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceRecord } from './attendance.entity';
import { ScheduleEvent } from '../schedules/schedule-event.entity';
import {
  ScheduleVersion,
  ScheduleVersionStatus,
} from '../schedules/schedule-version.entity';
import { AttendanceSessionStatus } from './attendance-session.entity';
import { AttendanceActor } from './attendance-access';

describe('AttendanceSessionService (OKUL-06, #265)', () => {
  let service: AttendanceSessionService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessionRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recordRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let versionRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let em: any;

  const makeRepo = () => ({
    findOne: jest.fn(),
    find: jest.fn(async () => []),
    save: jest.fn(async (e: Partial<AttendanceSession>) => ({
      ...e,
      id: e.id ?? 'sess-new',
    })),
    create: jest.fn((e: Partial<AttendanceSession>) => ({ ...e })),
    upsert: jest.fn(async () => undefined),
  });

  const baseInput: CreateSessionInput = {
    tenantId: 't1',
    scheduleEventId: 'evt-1',
    sessionDate: new Date('2026-09-01'),
    studentIds: ['s1', 's2', 's3'],
  };

  const publishedEvent = (overrides: Record<string, unknown> = {}) => ({
    id: 'evt-1',
    tenantId: 't1',
    branchId: 'b1',
    versionId: 'ver-1',
    teacherId: 'teach-1',
    studentGroupId: 'grp-1',
    courseId: 'c1',
    roomId: 'r1',
    ...overrides,
  });

  const publishedVersion = (overrides: Record<string, unknown> = {}) => ({
    id: 'ver-1',
    tenantId: 't1',
    status: ScheduleVersionStatus.PUBLISHED,
    publishedAt: new Date('2026-08-31T10:00:00Z'),
    unpublishedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    sessionRepo = makeRepo();
    eventRepo = makeRepo();
    recordRepo = makeRepo();
    versionRepo = makeRepo();
    // Transaction içi EntityManager mock'u: entity tipine göre ilgili repo
    // mock'unun jest.fn'lerine devreder (mevcut test beklentileri korunur).
    em = {
      findOne: jest.fn(async (entity: unknown, opts: unknown) => {
        if (entity === ScheduleEvent) return eventRepo.findOne(opts);
        if (entity === ScheduleVersion) return versionRepo.findOne(opts);
        if (entity === AttendanceRecord) return recordRepo.findOne(opts);
        return sessionRepo.findOne(opts);
      }),
      create: jest.fn((_entity: unknown, data: unknown) =>
        sessionRepo.create(data),
      ),
      // Session satırı `rosterSnapshot` taşır; attendance record taşımaz.
      save: jest.fn(async (entity: unknown) =>
        entity && typeof entity === 'object' && 'rosterSnapshot' in entity
          ? sessionRepo.save(entity)
          : recordRepo.save(entity),
      ),
    };
    sessionRepo.manager = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(em),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceSessionService,
        { provide: getRepositoryToken(AttendanceSession), useValue: sessionRepo },
        { provide: getRepositoryToken(AttendanceRecord), useValue: recordRepo },
      ],
    }).compile();
    service = moduleRef.get(AttendanceSessionService);
  });

  it('createFromPublishedOccurrence derives session from a published event + immutable roster', async () => {
    eventRepo.findOne = jest.fn(async () => publishedEvent());
    sessionRepo.findOne = jest.fn(async () => null);
    versionRepo.findOne = jest.fn(async () => publishedVersion());
    const sess = await service.createFromPublishedOccurrence(baseInput);
    expect(sess.teacherId).toBe('teach-1');
    // branchId istemciden değil, ScheduleEvent'ten gelir (server-authoritative).
    expect(sess.branchId).toBe('b1');
    expect(sess.rosterSnapshot).toEqual(['s1', 's2', 's3']);
    expect(sess.status).toBe(AttendanceSessionStatus.PUBLISHED);
    expect(sessionRepo.save).toHaveBeenCalled();
  });

  it('createFromPublishedOccurrence locks the ScheduleVersion row (pessimistic_write) inside one transaction', async () => {
    eventRepo.findOne = jest.fn(async () => publishedEvent());
    sessionRepo.findOne = jest.fn(async () => null);
    versionRepo.findOne = jest.fn(async () => publishedVersion());
    await service.createFromPublishedOccurrence(baseInput);
    // Yayın kontrolü + insert tek transaction'da (race-condition koruması, #265).
    expect(sessionRepo.manager.transaction).toHaveBeenCalled();
    expect(em.findOne).toHaveBeenCalledWith(ScheduleVersion, {
      where: { id: 'ver-1', tenantId: 't1' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('createFromPublishedOccurrence rejects a DRAFT schedule version (AC-2)', async () => {
    eventRepo.findOne = jest.fn(async () => publishedEvent());
    sessionRepo.findOne = jest.fn(async () => null);
    versionRepo.findOne = jest.fn(async () =>
      publishedVersion({ status: ScheduleVersionStatus.DRAFT, publishedAt: null }),
    );
    await expect(
      service.createFromPublishedOccurrence(baseInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionRepo.save).not.toHaveBeenCalled();
  });

  it('createFromPublishedOccurrence rejects an unpublished schedule version (AC-2)', async () => {
    eventRepo.findOne = jest.fn(async () => publishedEvent());
    sessionRepo.findOne = jest.fn(async () => null);
    versionRepo.findOne = jest.fn(async () =>
      publishedVersion({
        status: ScheduleVersionStatus.UNPUBLISHED,
        unpublishedAt: new Date('2026-09-05T10:00:00Z'),
      }),
    );
    await expect(
      service.createFromPublishedOccurrence(baseInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionRepo.save).not.toHaveBeenCalled();
  });

  it('createFromPublishedOccurrence rejects when the schedule version cannot be resolved (fail-closed)', async () => {
    eventRepo.findOne = jest.fn(async () => publishedEvent());
    sessionRepo.findOne = jest.fn(async () => null);
    versionRepo.findOne = jest.fn(async () => null);
    await expect(
      service.createFromPublishedOccurrence(baseInput),
    ).rejects.toThrow(/not found/);
    expect(sessionRepo.save).not.toHaveBeenCalled();
  });

  it('createFromPublishedOccurrence rejects an empty roster snapshot (immutable roster)', async () => {
    await expect(
      service.createFromPublishedOccurrence({ ...baseInput, studentIds: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(eventRepo.findOne).not.toHaveBeenCalled();
    expect(sessionRepo.save).not.toHaveBeenCalled();
  });

  it('createFromPublishedOccurrence is idempotent (returns existing; publish re-check yapılmaz)', async () => {
    eventRepo.findOne = jest.fn(async () => publishedEvent());
    sessionRepo.findOne = jest.fn(async () => ({ id: 'sess-existing' }));
    const sess = await service.createFromPublishedOccurrence(baseInput);
    expect(sess.id).toBe('sess-existing');
    expect(sessionRepo.save).not.toHaveBeenCalled();
    // Mevcut oturum oluşturulma anında published invariant'ı doğrulanmıştı;
    // idempotent dönüşte yayın sorgusu tekrar çalışmaz.
    expect(versionRepo.findOne).not.toHaveBeenCalled();
  });

  const managerActor: AttendanceActor = {
    userId: 'mgr-1',
    tenantId: 't1',
    roleIds: ['operations_manager'],
    teacherId: null,
  };
  const ownerActor: AttendanceActor = {
    userId: 'teach-1',
    tenantId: 't1',
    roleIds: ['teacher'],
    teacherId: 'teach-1',
  };
  const otherTeacherActor: AttendanceActor = {
    userId: 'teach-2',
    tenantId: 't1',
    roleIds: ['teacher'],
    teacherId: 'teach-2',
  };

  const publishedSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'sess-1',
    tenantId: 't1',
    teacherId: 'teach-1',
    rosterSnapshot: ['s1', 's2', 's3'],
    version: 1,
    status: AttendanceSessionStatus.PUBLISHED,
    ...overrides,
  });

  it('lock enforces optimistic concurrency (version mismatch throws)', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession({ version: 2 }));
    await expect(service.lock(managerActor, 'sess-1', 1)).rejects.toThrow(
      /version mismatch/,
    );
  });

  it('lock rejects a teacher who is not the session owner (BOLA negative)', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    await expect(
      service.lock(otherTeacherActor, 'sess-1', 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionRepo.save).not.toHaveBeenCalled();
  });

  it('lock transitions published -> locked and bumps version', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    const sess = await service.lock(managerActor, 'sess-1', 1);
    expect(sess.status).toBe(AttendanceSessionStatus.LOCKED);
    expect(sess.version).toBe(2);
    expect(sess.lockedById).toBe('mgr-1');
  });

  it('markRecord rejects on locked session (controlled correction required)', async () => {
    sessionRepo.findOne = jest.fn(async () =>
      publishedSession({ status: AttendanceSessionStatus.LOCKED }),
    );
    await expect(
      service.markRecord(ownerActor, {
        sessionId: 'sess-1',
        studentId: 's1',
        status: 'present' as never,
      }),
    ).rejects.toThrow(/locked/);
  });

  it('markRecord rejects a teacher who is not the session owner (BOLA negative)', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    await expect(
      service.markRecord(otherTeacherActor, {
        sessionId: 'sess-1',
        studentId: 's1',
        status: 'present' as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recordRepo.upsert).not.toHaveBeenCalled();
  });

  it('markRecord rejects a student outside the immutable roster snapshot', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    await expect(
      service.markRecord(ownerActor, {
        sessionId: 'sess-1',
        studentId: 'student-unknown',
        status: 'present' as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recordRepo.upsert).not.toHaveBeenCalled();
  });

  it('markRecord allows the owning teacher and stamps the server-side actor', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    recordRepo.findOne = jest.fn(async () => ({ id: 'rec-1' }));
    await service.markRecord(ownerActor, {
      sessionId: 'sess-1',
      studentId: 's1',
      status: 'present' as never,
    });
    expect(recordRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        studentId: 's1',
        markedById: 'teach-1',
      }),
    );
    expect(recordRepo.upsert).toHaveBeenCalled();
  });

  it('markRecord allows an oversight role on another teacher session (manager visibility)', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    recordRepo.findOne = jest.fn(async () => ({ id: 'rec-1' }));
    await expect(
      service.markRecord(managerActor, {
        sessionId: 'sess-1',
        studentId: 's2',
        status: 'present' as never,
      }),
    ).resolves.toBeDefined();
  });

  it('markRecord rejects an unknown session (fail-closed)', async () => {
    sessionRepo.findOne = jest.fn(async () => null);
    await expect(
      service.markRecord(ownerActor, {
        sessionId: 'missing',
        studentId: 's1',
        status: 'present' as never,
      }),
    ).rejects.toThrow(/not found/);
  });

  it('listByTenant returns tenant-wide sessions for oversight roles (manager visibility)', async () => {
    sessionRepo.find = jest.fn(async () => [publishedSession()]);
    const sessions = await service.listByTenant('t1');
    expect(sessions).toHaveLength(1);
    expect(sessionRepo.find).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      order: { sessionDate: 'DESC' },
    });
  });

  it('markRecord masks free-text notes on the write path (KVKK, AC-5)', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    recordRepo.findOne = jest.fn(async () => ({ id: 'rec-1' }));

    await service.markRecord(ownerActor, {
      sessionId: 'sess-1',
      studentId: 's1',
      status: 'excused' as never,
      notes: 'Veli 0532 111 22 33 numarasından arandı',
    });

    const created = recordRepo.create.mock.calls[0][0];
    expect(created.notes).toBe('[REDACTED]');
    expect(JSON.stringify(created)).not.toContain('0532');
  });

  it('markRecord stores null when no note is supplied', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    recordRepo.findOne = jest.fn(async () => ({ id: 'rec-1' }));

    await service.markRecord(ownerActor, {
      sessionId: 'sess-1',
      studentId: 's1',
      status: 'present' as never,
    });

    expect(recordRepo.create.mock.calls[0][0].notes).toBeNull();
  });

  const lockedSession = (overrides: Record<string, unknown> = {}) =>
    publishedSession({ status: AttendanceSessionStatus.LOCKED, ...overrides });

  const existingRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'rec-1',
    tenantId: 't1',
    sessionId: 'sess-1',
    studentId: 's1',
    status: 'absent',
    notes: null,
    correctionCount: 0,
    ...overrides,
  });

  const correctionInput = {
    sessionId: 'sess-1',
    studentId: 's1',
    status: 'excused' as never,
    reasonCode: 'excused_document' as never,
    expectedVersion: 1,
  };

  it('correctRecord requires a locked session (submit -> lock -> correction, AC-4)', async () => {
    sessionRepo.findOne = jest.fn(async () => publishedSession());
    await expect(
      service.correctRecord(managerActor, correctionInput),
    ).rejects.toThrow(/not locked/);
    expect(recordRepo.save).not.toHaveBeenCalled();
  });

  it('correctRecord rejects a teacher even for their own session (separation of duties)', async () => {
    sessionRepo.findOne = jest.fn(async () => lockedSession());
    await expect(
      service.correctRecord(ownerActor, correctionInput),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recordRepo.save).not.toHaveBeenCalled();
  });

  it('correctRecord rejects a version mismatch (optimistic concurrency)', async () => {
    sessionRepo.findOne = jest.fn(async () => lockedSession({ version: 5 }));
    await expect(
      service.correctRecord(managerActor, correctionInput),
    ).rejects.toThrow(/version mismatch/);
  });

  it('correctRecord rejects a reason code outside the closed vocabulary', async () => {
    sessionRepo.findOne = jest.fn(async () => lockedSession());
    await expect(
      service.correctRecord(managerActor, {
        ...correctionInput,
        reasonCode: 'serbest_metin' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sessionRepo.manager.transaction).not.toHaveBeenCalled();
  });

  it('correctRecord rejects a student outside the immutable roster snapshot', async () => {
    sessionRepo.findOne = jest.fn(async () => lockedSession());
    await expect(
      service.correctRecord(managerActor, {
        ...correctionInput,
        studentId: 'student-unknown',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('correctRecord rejects when there is no record to correct (fail-closed)', async () => {
    sessionRepo.findOne = jest.fn(async () => lockedSession());
    recordRepo.findOne = jest.fn(async () => null);
    await expect(
      service.correctRecord(managerActor, correctionInput),
    ).rejects.toThrow(/not found/);
    expect(recordRepo.save).not.toHaveBeenCalled();
  });

  it('correctRecord masks the correction note, stamps the actor and bumps the session version', async () => {
    sessionRepo.findOne = jest.fn(async () => lockedSession({ version: 3 }));
    recordRepo.findOne = jest.fn(async () => existingRecord());
    recordRepo.save = jest.fn(async (e: Record<string, unknown>) => ({ ...e }));

    const result = await service.correctRecord(managerActor, {
      ...correctionInput,
      expectedVersion: 3,
      notes: 'Veli 0532 111 22 33 numarasından arandı',
    });

    const saved = recordRepo.save.mock.calls[0][0];
    expect(saved.status).toBe('excused');
    expect(saved.notes).toBe('[REDACTED]');
    expect(JSON.stringify(saved)).not.toContain('0532');
    expect(saved.correctionReasonCode).toBe('excused_document');
    expect(saved.correctedById).toBe('mgr-1');
    expect(saved.correctedAt).toBeInstanceOf(Date);
    expect(saved.correctionCount).toBe(1);
    expect(result.sessionVersion).toBe(4);
    expect(sessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sess-1', version: 4 }),
    );
  });

  it('correctRecord rejects an unknown session (fail-closed)', async () => {
    sessionRepo.findOne = jest.fn(async () => null);
    await expect(
      service.correctRecord(managerActor, correctionInput),
    ).rejects.toThrow(/not found/);
  });
});
