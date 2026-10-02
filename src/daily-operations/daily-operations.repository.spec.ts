import { DailyOperationsRepository, SubstituteIneligibleError } from './daily-operations.repository';
import { LeaveImpactRangeTooLargeException } from '../leaves/leave-errors';

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
    jest.spyOn(repository as any, 'findApprovedLeave').mockResolvedValue(leave);
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
