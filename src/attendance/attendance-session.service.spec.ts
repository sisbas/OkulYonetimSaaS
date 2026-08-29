import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AttendanceSessionService,
  CreateSessionInput,
} from './attendance-session.service';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceRecord } from './attendance.entity';
import { ScheduleEvent } from '../schedules/schedule-event.entity';
import { AttendanceSessionStatus } from './attendance-session.entity';

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

  it('lock enforces optimistic concurrency (version mismatch throws)', async () => {
    sessionRepo.findOne = jest.fn(async () => ({
      id: 'sess-1',
      tenantId: 't1',
      version: 2,
      status: AttendanceSessionStatus.PUBLISHED,
    }));
    await expect(
      service.lock('t1', 'sess-1', 'mgr-1', 1),
    ).rejects.toThrow(/version mismatch/);
  });

  it('lock transitions published -> locked and bumps version', async () => {
    sessionRepo.findOne = jest.fn(async () => ({
      id: 'sess-1',
      tenantId: 't1',
      version: 1,
      status: AttendanceSessionStatus.PUBLISHED,
    }));
    const sess = await service.lock('t1', 'sess-1', 'mgr-1', 1);
    expect(sess.status).toBe(AttendanceSessionStatus.LOCKED);
    expect(sess.version).toBe(2);
  });

  it('markRecord rejects on locked session (controlled correction required)', async () => {
    sessionRepo.findOne = jest.fn(async () => ({
      id: 'sess-1',
      tenantId: 't1',
      status: AttendanceSessionStatus.LOCKED,
    }));
    await expect(
      service.markRecord({
        tenantId: 't1',
        sessionId: 'sess-1',
        studentId: 's1',
        status: 'present' as never,
      }),
    ).rejects.toThrow(/locked/);
  });
});
