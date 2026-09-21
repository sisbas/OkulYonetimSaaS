import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AttendanceSessionService,
  CreateSessionInput,
} from './attendance-session.service';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceRecord } from './attendance.entity';
import { ScheduleEvent } from '../schedules/schedule-event.entity';
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
    branchId: 'b1',
    scheduleEventId: 'evt-1',
    sessionDate: new Date('2026-09-01'),
    studentIds: ['s1', 's2', 's3'],
  };

  beforeEach(async () => {
    sessionRepo = makeRepo();
    eventRepo = makeRepo();
    recordRepo = makeRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceSessionService,
        { provide: getRepositoryToken(AttendanceSession), useValue: sessionRepo },
        { provide: getRepositoryToken(ScheduleEvent), useValue: eventRepo },
        { provide: getRepositoryToken(AttendanceRecord), useValue: recordRepo },
      ],
    }).compile();
    service = moduleRef.get(AttendanceSessionService);
  });

  it('createFromPublishedOccurrence derives session from event + immutable roster', async () => {
    eventRepo.findOne = jest.fn(async () => ({
      id: 'evt-1',
      tenantId: 't1',
      teacherId: 'teach-1',
      studentGroupId: 'grp-1',
      courseId: 'c1',
      roomId: 'r1',
    }));
    sessionRepo.findOne = jest.fn(async () => null);
    const sess = await service.createFromPublishedOccurrence(baseInput);
    expect(sess.teacherId).toBe('teach-1');
    expect(sess.rosterSnapshot).toEqual(['s1', 's2', 's3']);
    expect(sess.status).toBe(AttendanceSessionStatus.PUBLISHED);
    expect(sessionRepo.save).toHaveBeenCalled();
  });

  it('createFromPublishedOccurrence is idempotent (returns existing)', async () => {
    eventRepo.findOne = jest.fn(async () => ({ id: 'evt-1', tenantId: 't1' }));
    sessionRepo.findOne = jest.fn(async () => ({ id: 'sess-existing' }));
    const sess = await service.createFromPublishedOccurrence(baseInput);
    expect(sess.id).toBe('sess-existing');
    expect(sessionRepo.save).not.toHaveBeenCalled();
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
});
