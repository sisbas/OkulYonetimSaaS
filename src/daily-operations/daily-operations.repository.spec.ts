import { DailyOperationsRepository, SubstituteIneligibleError } from './daily-operations.repository';

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
