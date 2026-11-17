import { DailyOperationsRepository, SubstituteIneligibleError } from './daily-operations.repository';
import { LeaveImpactRangeTooLargeException } from '../leaves/leave-errors';
import { LeaveCoverageStatus } from '../leaves/leave-request.entity';

// Fault injection at the eligibility boundary: no DB or pilot acceptance claim.
describe('candidate lookup error integrity', () => {
  const events = [{ occurrenceDate: '2026-09-14', startsAt: new Date(), endsAt: new Date() }];
  const leave = { id: 'leave', tenantId: 'tenant', branchId: 'branch', teacherId: 'original' };

  function setup() {
    const repository = new DailyOperationsRepository({} as any, {} as any);
    const manager = { query: jest.fn().mockResolvedValue([
      { teacherId: 'candidate-a', teacherBranchId: 'branch-a' },
      { teacherId: 'candidate-b', teacherBranchId: 'branch-b' },
    ]) };
    const check = jest.spyOn(repository as any, 'assertEligibleCandidate');
    return { repository, manager, check };
  }

  it('omits a controlled ineligible teacher and continues checking the next teacher', async () => {
    const { repository, manager, check } = setup();
    check.mockRejectedValueOnce(new SubstituteIneligibleError('TEACHER_COURSE_MISMATCH'))
      .mockResolvedValueOnce(undefined);
    const result = await (repository as any).findEligibleCandidates(manager, leave, events);
    expect(result.map((x: any) => x.teacherId)).toEqual(['candidate-b']);
  });

  it.each([new Error('Database unavailable'), new Error('TEACHER_COURSE_ELIGIBILITY_NOT_READY')])(
    'propagates dependency failure without a finalized empty list: %s', async (failure) => {
      const { repository, manager, check } = setup();
      check.mockRejectedValue(failure);
      await expect((repository as any).findEligibleCandidates(manager, leave, events)).rejects.toBe(failure);
      expect(check).toHaveBeenCalledTimes(1);
    },
  );

  it('does not return a partial successful list when a later teacher lookup fails', async () => {
    const { repository, manager, check } = setup();
    const failure = new Error('Connection lost');
    check.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);
    await expect((repository as any).findEligibleCandidates(manager, leave, events)).rejects.toBe(failure);
  });
});

// #263 review P2: aday listesi etkilenen olayların KESİŞİMİ değil BİRLEŞİMİdir.
describe('candidate lookup across multiple impacted events (union, #263 review P2)', () => {
  const events = [
    {
      occurrenceDate: '2026-09-14',
      startsAt: new Date('2026-09-14T09:00:00.000Z'),
      endsAt: new Date('2026-09-14T10:00:00.000Z'),
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
      courseId: 'course',
      scheduleEventId: 'lesson',
    },
    {
      occurrenceDate: '2026-09-21',
      startsAt: new Date('2026-09-21T09:00:00.000Z'),
      endsAt: new Date('2026-09-21T10:00:00.000Z'),
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
      courseId: 'course',
      scheduleEventId: 'lesson',
    },
  ];
  const leave = { id: 'leave', tenantId: 'tenant', branchId: 'branch', teacherId: 'original' };

  function setup() {
    const repository = new DailyOperationsRepository({} as any, {} as any);
    const manager = { query: jest.fn().mockResolvedValue([
      { teacherId: 'math-only', teacherBranchId: 'branch-a' },
      { teacherId: 'ineligible', teacherBranchId: 'branch-b' },
    ]) };
    const check = jest.spyOn(repository as any, 'assertEligibleCandidate');
    return { repository, manager, check };
  }

  it('keeps a teacher eligible for ONE of the impacted events (union, not intersection)', async () => {
    const { repository, manager, check } = setup();
    // math-only: 1. olayda uygun, 2. olayda uygun değil → BİRLEŞİM gereği aday.
    check
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new SubstituteIneligibleError('TEACHER_COURSE_MISMATCH'))
      // ineligible: her iki olayda da uygun değil → aday DEĞİL.
      .mockRejectedValueOnce(new SubstituteIneligibleError('TEACHER_COURSE_MISMATCH'))
      .mockRejectedValueOnce(new SubstituteIneligibleError('TEACHER_COURSE_MISMATCH'));

    const result = await (repository as any).findEligibleCandidates(manager, leave, events);
    expect(result.map((x: any) => x.teacherId)).toEqual(['math-only']);
  });

  it('stops checking further events once one event qualifies the teacher', async () => {
    const { repository, manager, check } = setup();
    check
      // math-only: 1. olayda uygun → kısa devre (tek çağrı).
      .mockResolvedValueOnce(undefined)
      // ineligible: iki olayda da uygun değil → iki çağrı.
      .mockRejectedValueOnce(new SubstituteIneligibleError('TEACHER_COURSE_MISMATCH'))
      .mockRejectedValueOnce(new SubstituteIneligibleError('TEACHER_COURSE_MISMATCH'));

    const result = await (repository as any).findEligibleCandidates(manager, leave, events);
    expect(result.map((x: any) => x.teacherId)).toEqual(['math-only']);
    // 1 (math-only kısa devre) + 2 (ineligible, tüm olaylar) = 3
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('batches eligibility checks for every assignment occurrence into one query', async () => {
    const { repository, manager } = setup();
    manager.query.mockResolvedValueOnce([{ teacherId: 'ineligible', teacherBranchId: 'branch-b' }]);
    const result = await (repository as any).findEligibleCandidates(manager, leave, events, 'all');
    expect(result.map((x: any) => x.teacherId)).toEqual(['ineligible']);
    expect(manager.query).toHaveBeenCalledTimes(1);
    const [query, parameters] = manager.query.mock.calls[0];
    expect(query).toContain('jsonb_to_recordset($5::jsonb)');
    expect(query).toContain('FROM teacher_courses');
    expect(query).toContain('FROM leave_requests');
    expect(query).toContain('FROM schedule_events event');
    expect(query).toContain('FROM leave_substitution_assignments assignment');
    expect(JSON.parse(parameters[4])).toEqual(events.map((event) => ({
      occurrenceDate: event.occurrenceDate,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      dayOfWeek: event.dayOfWeek,
      startTime: event.startTime,
      endTime: event.endTime,
      courseId: event.courseId,
      scheduleEventId: event.scheduleEventId,
    })));
  });

  it('keeps all-occurrence database round trips bounded for large candidate and occurrence sets', async () => {
    const { repository, manager } = setup();
    const manyOccurrences = Array.from({ length: 500 }, (_, index) => {
      const startsAt = new Date(Date.UTC(2026, 0, 5 + index * 7, 9));
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      return {
        ...events[0],
        occurrenceDate: startsAt.toISOString().slice(0, 10),
        startsAt,
        endsAt,
      };
    });
    const manyCandidates = Array.from({ length: 50 }, (_, index) => ({
      teacherId: `candidate-${index}`,
      teacherBranchId: `branch-${index}`,
    }));
    manager.query.mockResolvedValueOnce(manyCandidates);

    const result = await (repository as any).findEligibleCandidates(manager, leave, manyOccurrences, 'all');

    expect(result).toHaveLength(50);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(JSON.parse(manager.query.mock.calls[0][1][4])).toHaveLength(500);
  });

  it('propagates an eligibility-query failure without returning partial candidates', async () => {
    const { repository, manager } = setup();
    const failure = new Error('Connection lost during batched eligibility lookup');
    manager.query.mockRejectedValueOnce(failure);
    await expect((repository as any).findEligibleCandidates(manager, leave, events, 'all')).rejects.toBe(failure);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('public event candidates query all occurrences and return the database-filtered set', async () => {
    const { repository, manager, check } = setup();
    (repository as any).dataSource.manager = manager;
    jest.spyOn(repository as any, 'findLeaveForPreview').mockResolvedValue(leave);
    jest.spyOn(repository as any, 'loadImpactedEvents').mockResolvedValue(
      events.map((event) => ({ ...event, scheduleEventId: 'lesson', courseId: 'course' })),
    );
    jest.spyOn(repository as any, 'teacherCoursesReady').mockResolvedValue(true);
    manager.query.mockResolvedValueOnce([]);
    const result = await repository.candidates(
      { tenantId: 'tenant', requestId: 'candidate-boundary' }, 'leave', 'lesson',
    );
    expect(result.eligibilityFinalized).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls[0][0]).toContain('jsonb_to_recordset($5::jsonb)');
    expect(JSON.parse(manager.query.mock.calls[0][1][4]).map((event: any) => event.occurrenceDate))
      .toEqual(events.map((event) => event.occurrenceDate));
    expect(check).not.toHaveBeenCalled();
  });
});

// #263 review P1: sınırsız occurrence genişlemesi YASAK (sessiz kırpma yok).
describe('occurrence expansion bound (#263 review P1)', () => {
  const repository = new DailyOperationsRepository({} as any, {} as any);
  const publishedRow = {
    effectiveFrom: '2020-01-06',
    effectiveTo: null,
    dayOfWeek: 1,
    startTime: '09:00:00',
    endTime: '10:00:00',
  };

  it('rejects a period that would expand beyond the cap with an explicit error', () => {
    const leave = { startsAt: new Date('2020-01-06T00:00:00.000Z'), endsAt: new Date('2030-01-06T00:00:00.000Z') };
    expect(() => (repository as any).expandOccurrences([publishedRow], leave)).toThrow(
      LeaveImpactRangeTooLargeException,
    );
  });

  it('expands a bounded period normally', () => {
    // 07.09.2026 (Pzt) → 27.09.2026 (Pzt değil) aralığı: 07.09, 14.09, 21.09 Pazartesileri.
    const leave = { startsAt: new Date('2026-09-07T00:00:00.000Z'), endsAt: new Date('2026-09-27T00:00:00.000Z') };
    const result = (repository as any).expandOccurrences([publishedRow], leave) as unknown[];
    expect(result).toHaveLength(3);
  });
});

// #461 F4 backfill uyumluluğu (#509 review P1): migration 1910000000000, eski
// olay-düzeyi (`occurrence_date IS NULL`) atamaların tek-tarihli olanlarını
// occurrence'a kesinler; gerçekten çok-tarihli kalan olay-düzeyi satırlar
// TÜM occurrence'ları kapsar — yoksa projeksiyon tekrarı kapsama bilgisini
// kaybederdi (Codex P1).
describe('legacy event-level (NULL occurrence_date) assignment compatibility', () => {
  const occurrence = (occurrenceDate: string): any => ({
    scheduleEventId: 'lesson',
    scheduleId: 'schedule-1',
    scheduleVersionId: 'version-1',
    teacherId: 'teacher-1',
    teacherBranchId: 'tb-1',
    studentGroupId: 'group-1',
    courseId: 'course-1',
    roomId: 'room-1',
    timeSlotId: 'slot-1',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    courseLabel: 'Matematik',
    groupLabel: '5-A',
    roomLabel: 'Derslik 1',
    occurrenceDate,
    startsAt: new Date(`${occurrenceDate}T09:00:00.000Z`),
    endsAt: new Date(`${occurrenceDate}T10:00:00.000Z`),
  });
  const events = [occurrence('2026-09-14'), occurrence('2026-09-21')];
  const legacyAssignment = {
    id: 'assignment-1',
    scheduleEventId: 'lesson',
    scheduleVersionId: 'version-1',
    occurrenceDate: null,
    substituteTeacherId: 'sub-1',
  };
  const repository = new DailyOperationsRepository({} as any, {} as any);

  it('counts a NULL-dated event-level assignment as covering every occurrence of its event', () => {
    expect((repository as any).resolvedLessonCount(events, [legacyAssignment])).toBe(2);
    expect((repository as any).coverageFor(events, [legacyAssignment])).toBe(LeaveCoverageStatus.COVERED);
  });

  it('does not leak coverage onto a different event or version', () => {
    const foreignEvent = { ...legacyAssignment, id: 'foreign-event', scheduleEventId: 'other' };
    const foreignVersion = { ...legacyAssignment, id: 'foreign-version', scheduleVersionId: 'version-2' };
    expect((repository as any).resolvedLessonCount(events, [foreignEvent])).toBe(0);
    expect((repository as any).resolvedLessonCount(events, [foreignVersion])).toBe(0);
  });

  it('keeps occurrence-level dated assignments exact (no cross-occurrence leak)', () => {
    const dated = { ...legacyAssignment, id: 'dated', occurrenceDate: '2026-09-14' };
    expect((repository as any).resolvedLessonCount(events, [dated])).toBe(1);
    expect((repository as any).coverageFor(events, [dated])).toBe(LeaveCoverageStatus.PARTIALLY_COVERED);
  });

  it('replays projection with the NULL assignment marked resolved on every occurrence', async () => {
    const calls: Array<[string, unknown[]]> = [];
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        calls.push([sql, params ?? []]);
        return [];
      }),
    };
    const leave = {
      id: 'leave-1',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      teacherId: 'teacher-1',
      decisionStatus: 'approved',
      coverageStatus: 'covered',
      startsAt: new Date('2026-09-14T00:00:00.000Z'),
      endsAt: new Date('2026-09-28T00:00:00.000Z'),
      version: 3,
    } as any;

    await (repository as any).project(manager, leave, events, [legacyAssignment]);

    const inserts = calls.filter(([sql]) => sql.includes('INSERT INTO daily_operation_lessons'));
    expect(inserts).toHaveLength(2);
    for (const [, params] of inserts) {
      expect(params[7]).toBe('resolved');
      expect(params[9]).toBe('assignment-1');
    }
  });
});
