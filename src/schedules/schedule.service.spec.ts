import { NotFoundException, ConflictException } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { Schedule } from './schedule.entity';
import { ScheduleVersion, ScheduleVersionStatus } from './schedule-version.entity';
import { ScheduleEvent } from './schedule-event.entity';
import { ScheduleEventDraft } from './m3-schedule-contract';

const REFS = {
  activeTeacherIds: new Set(['teacher-1', 'teacher-2']),
  activeStudentGroupIds: new Set(['group-1', 'group-2']),
  activeRoomIds: new Set(['room-1', 'room-2']),
  activeTimeSlotIds: new Set(['ts-1']),
  activeTeacherBranchIds: new Set(['tb-1']),
  activeTeacherCourseKeys: new Set(['teacher-1:course-1', 'teacher-2:course-1']),
};

function makeEvent(over: Partial<ScheduleEventDraft> = {}): ScheduleEventDraft {
  return {
    eventId: 'e1',
    teacherId: 'teacher-1',
    teacherBranchId: 'tb-1',
    studentGroupId: 'group-1',
    courseId: 'course-1',
    roomId: 'room-1',
    timeSlotId: 'ts-1',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
    ...over,
  };
}

function makeService() {
  const scheduleRepo: any = {
    create: (e: Partial<Schedule>) => ({ ...e }) as Schedule,
    save: async (e: Schedule) => e,
    findOne: async () => null,
    increment: async () => undefined,
    update: async () => undefined,
  };
  const versionRepo: any = {
    create: (e: Partial<ScheduleVersion>) => ({ ...e }) as ScheduleVersion,
    save: async (e: ScheduleVersion) => ({ ...e, id: 'v1' } as ScheduleVersion),
    findOne: async () => null,
    update: async () => undefined,
    createQueryBuilder: () => ({
      select: () => ({
        where: () => ({
          getRawOne: async () => ({ max: 0 }),
        }),
      }),
    }),
  };
  const eventRepo: any = {
    delete: async () => undefined,
    create: (e: any) => e,
    save: async (e: ScheduleEvent[]) => e,
  };
  const solver: any = {
    solve: async () => ({
      status: 'SOLVED',
      events: [],
      placementRatio: 1,
      unplaced: [],
      relaxations: [],
      diagnostics: { placedCount: 0, demandedCount: 0, teacherLoad: {}, roomLoad: {}, groupLoad: {}, dayBalance: {} },
      bestSoFar: true,
      seed: 0,
      nodesVisited: 0,
      durationMs: 0,
    }),
  };
  const service = new ScheduleService(scheduleRepo, versionRepo, eventRepo, solver);
  return { service, scheduleRepo, versionRepo, eventRepo, solver };
}

describe('ScheduleService (P1B-05 wiring)', () => {
  it('createSchedule persists a draft schedule with revision 1', async () => {
    const { service, scheduleRepo } = makeService();
    let saved: Schedule | null = null;
    scheduleRepo.save = async (e: Schedule) => {
      saved = e;
      return e;
    };
    const result = await service.createSchedule({
      tenantId: 't1',
      branchId: 'b1',
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    expect(result.status).toBe('draft');
    expect(result.revision).toBe(1);
    expect(saved!.tenantId).toBe('t1');
    expect(saved!.branchId).toBe('b1');
  });

  it('saveDraft throws on missing schedule', async () => {
    const { service } = makeService();
    await expect(
      service.saveDraft({
        tenantId: 't1',
        branchId: 'b1',
        scheduleId: 'missing',
        events: [makeEvent()],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('saveDraft rejects immutable published schedule', async () => {
    const { service, scheduleRepo } = makeService();
    scheduleRepo.findOne = async () =>
      ({ id: 's1', tenantId: 't1', status: 'published' } as Schedule);
    await expect(
      service.saveDraft({
        tenantId: 't1',
        branchId: 'b1',
        scheduleId: 's1',
        events: [makeEvent()],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('saveDraft creates a draft version and stores events', async () => {
    const { service, scheduleRepo, versionRepo, eventRepo } = makeService();
    scheduleRepo.findOne = async () =>
      ({ id: 's1', tenantId: 't1', status: 'draft' } as Schedule);
    let savedVersion: ScheduleVersion | null = null;
    versionRepo.save = async (e: ScheduleVersion) => {
      savedVersion = e;
      return { ...e, id: 'v1' } as ScheduleVersion;
    };
    const events = [makeEvent(), makeEvent({ eventId: 'e2', startTime: '10:00', endTime: '11:00' })];
    let deletedFilter: any = null;
    eventRepo.delete = async (f: any) => {
      deletedFilter = f;
      return undefined;
    };
    let savedEvents: ScheduleEvent[] = [];
    eventRepo.save = async (e: ScheduleEvent[]) => {
      savedEvents = e;
      return e;
    };
    const result = await service.saveDraft({
      tenantId: 't1',
      branchId: 'b1',
      scheduleId: 's1',
      events,
    });
    expect(result.id).toBe('v1');
    expect(deletedFilter.scheduleId).toBe('s1');
    expect(savedEvents.length).toBe(2);
    expect(savedEvents[0].teacherId).toBe('teacher-1');
  });

  it('validateDraft returns valid for non-overlapping events', async () => {
    const { service } = makeService();
    const events = [
      makeEvent(),
      makeEvent({ eventId: 'e2', teacherId: 'teacher-2', startTime: '10:00', endTime: '11:00' }),
    ];
    const evidence = await service.validateDraft('t1', 'b1', 's1', events, 1, REFS);
    expect(evidence.status).toBe('valid');
    expect(evidence.canPublish).toBe(true);
  });

  it('validateDraft returns invalid with suggestions on teacher overlap', async () => {
    const { service } = makeService();
    const events = [
      makeEvent(),
      makeEvent({ eventId: 'e2', startTime: '09:30', endTime: '10:30' }),
    ];
    const evidence = await service.validateDraft('t1', 'b1', 's1', events, 1, REFS);
    expect(evidence.status).toBe('invalid');
    expect(evidence.suggestions.length).toBeGreaterThan(0);
  });

  it('publish rejects when no draft version exists', async () => {
    const { service } = makeService();
    await expect(
      service.publish('t1', 'b1', 's1', 'actor', 'req', [makeEvent()], 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unpublish marks the active version unpublished and clears schedule active version', async () => {
    const { service, scheduleRepo, versionRepo } = makeService();
    scheduleRepo.findOne = async () =>
      ({
        id: 's1',
        tenantId: 't1',
        branchId: 'b1',
        status: 'published',
        revision: 3,
        activeVersionId: 'v1',
      }) as Schedule;
    versionRepo.findOne = async () =>
      ({
        id: 'v1',
        tenantId: 't1',
        branchId: 'b1',
        scheduleId: 's1',
        versionNo: 2,
        status: ScheduleVersionStatus.PUBLISHED,
        publishedAt: new Date('2026-09-01T09:00:00.000Z'),
      }) as ScheduleVersion;

    const versionUpdates: Array<[string, Partial<ScheduleVersion>]> = [];
    versionRepo.update = async (id: string, update: Partial<ScheduleVersion>) => {
      versionUpdates.push([id, update]);
      return undefined;
    };
    const scheduleUpdates: Array<[unknown, Partial<Schedule>]> = [];
    scheduleRepo.update = async (filter: unknown, update: Partial<Schedule>) => {
      scheduleUpdates.push([filter, update]);
      return undefined;
    };

    await service.unpublish('t1', 'b1', 's1', 'actor', 'req', 3);

    expect(versionUpdates).toHaveLength(1);
    expect(versionUpdates[0][0]).toBe('v1');
    expect(versionUpdates[0][1].status).toBe(ScheduleVersionStatus.UNPUBLISHED);
    expect(versionUpdates[0][1].unpublishedAt).toBeInstanceOf(Date);
    expect(scheduleUpdates).toHaveLength(1);
    expect(scheduleUpdates[0][1]).toMatchObject({
      status: 'unpublished',
      activeVersionId: null,
      revision: 3,
    });
  });

  it('solve() builds the active-reference lookup from demands, not an empty event list (bh0ii)', async () => {
    const { service, scheduleRepo } = makeService();
    scheduleRepo.findOne = async () => ({ id: 's1', revision: 2, status: 'draft', effectiveFrom: new Date('2026-09-01') }) as Schedule;
    const spy = jest.spyOn(service as unknown as { loadActiveReferences: unknown }, 'loadActiveReferences' as never) as unknown as jest.SpyInstance;

    const demands = [
      {
        demandId: 'd1',
        studentGroupId: 'g1',
        courseId: 'c1',
        teacherId: 't1',
        teacherBranchId: 'tb1',
        timeSlots: [{ id: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }],
        roomIds: ['r1'],
      },
    ];

    try {
      await service.solve({
        tenantId: 't1',
        branchId: 'b1',
        scheduleId: 's1',
        demands,
        seed: 1,
        correlationId: 'c1',
      });
    } catch {
      // solver mock may not produce a full result; we only assert the reference build.
    }

    expect(spy).toHaveBeenCalled();
    const passedEvents = spy.mock.calls[0][2] as Array<{ teacherId: string; studentGroupId: string; timeSlotId: string }>;
    expect(passedEvents.some((e) => e.teacherId === 't1' && e.studentGroupId === 'g1' && e.timeSlotId === 's1')).toBe(true);
    spy.mockRestore();
  });
});
