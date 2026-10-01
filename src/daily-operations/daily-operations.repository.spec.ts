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
    { occurrenceDate: '2026-09-14', startsAt: new Date('2026-09-14T09:00:00.000Z'), endsAt: new Date('2026-09-14T10:00:00.000Z') },
    { occurrenceDate: '2026-09-21', startsAt: new Date('2026-09-21T09:00:00.000Z'), endsAt: new Date('2026-09-21T10:00:00.000Z') },
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

  it('event-specific candidates must qualify for every occurrence covered by assignment', async () => {
    const { repository, manager, check } = setup();
    check.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new SubstituteIneligibleError('SUBSTITUTE_TIME_CONFLICT'))
      .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const result = await (repository as any).findEligibleCandidates(manager, leave, events, 'all');
    expect(result.map((x: any) => x.teacherId)).toEqual(['ineligible']);
    expect(check).toHaveBeenCalledTimes(4);
  });

  it('propagates a later occurrence database failure in event-specific lookup', async () => {
    const { repository, manager, check } = setup();
    const failure = new Error('Connection lost on second occurrence');
    check.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);
    await expect((repository as any).findEligibleCandidates(manager, leave, events, 'all')).rejects.toBe(failure);
  });

  it('public event candidates reject a teacher unavailable for a later occurrence', async () => {
    const { repository, manager, check } = setup();
    (repository as any).dataSource.manager = manager;
    jest.spyOn(repository as any, 'findApprovedLeave').mockResolvedValue(leave);
    jest.spyOn(repository as any, 'loadImpactedEvents').mockResolvedValue(
      events.map((event) => ({ ...event, scheduleEventId: 'lesson', courseId: 'course' })),
    );
    jest.spyOn(repository as any, 'teacherCoursesReady').mockResolvedValue(true);
    check.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new SubstituteIneligibleError('SUBSTITUTE_TIME_CONFLICT'))
      .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const result = await repository.candidates(
      { tenantId: 'tenant', requestId: 'candidate-boundary' }, 'leave', 'lesson',
    );
    expect(result.eligibilityFinalized).toBe(true);
    expect(result.candidates.map((candidate) => candidate.teacherId)).toEqual(['ineligible']);
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
