import {
  LeavePolicyError,
  decideLeaveRequest,
  deriveLeaveCoverageStatus,
} from './leave-policy';

const pendingRequest = {
  status: 'pending' as const,
  coverageStatus: 'unresolved' as const,
  requesterUserId: 'requester-1',
  decisionMakerUserId: 'manager-1',
  currentVersion: 3,
  expectedVersion: 3,
};

describe('LeavePolicy', () => {
  it.each(['unresolved', 'partially_covered'] as const)(
    'allows a manager decision while %s lessons remain open for Daily Operations',
    (coverageStatus) => {
      expect(decideLeaveRequest({
        ...pendingRequest,
        coverageStatus,
        decision: 'approved',
      })).toEqual({
        status: 'approved',
        coverageStatus,
        version: 4,
      });
    },
  );

  it('rejects a pending request and increments the optimistic version', () => {
    expect(decideLeaveRequest({ ...pendingRequest, decision: 'rejected' })).toEqual({
      status: 'rejected',
      coverageStatus: 'unresolved',
      version: 4,
    });
  });

  it('forbids self-approval even when the actor can reach the decision use case', () => {
    expect(() => decideLeaveRequest({
      ...pendingRequest,
      decision: 'approved',
      decisionMakerUserId: pendingRequest.requesterUserId,
    })).toThrow(expect.objectContaining<Partial<LeavePolicyError>>({
      code: 'SELF_APPROVAL_FORBIDDEN',
    }));
  });

  it.each(['approved', 'rejected'] as const)(
    'keeps the %s terminal state immutable',
    (status) => {
      expect(() => decideLeaveRequest({
        ...pendingRequest,
        status,
        decision: status === 'approved' ? 'rejected' : 'approved',
      })).toThrow(expect.objectContaining<Partial<LeavePolicyError>>({
        code: 'INVALID_LEAVE_STATE',
      }));
    },
  );

  it('rejects stale optimistic versions before changing state', () => {
    expect(() => decideLeaveRequest({
      ...pendingRequest,
      expectedVersion: 2,
      decision: 'approved',
    })).toThrow(expect.objectContaining<Partial<LeavePolicyError>>({
      code: 'LEAVE_VERSION_MISMATCH',
    }));
  });

  it.each([
    [0, 0, 'not_required'],
    [3, 0, 'unresolved'],
    [3, 2, 'partially_covered'],
    [3, 3, 'covered'],
  ] as const)('derives coverage for %s impacts and %s assignments', (impacts, covered, expected) => {
    expect(deriveLeaveCoverageStatus(impacts, covered)).toBe(expected);
  });

  it.each([
    [-1, 0],
    [1, -1],
    [1, 2],
    [1.5, 1],
  ])('rejects invalid coverage counts %s/%s', (impacts, covered) => {
    expect(() => deriveLeaveCoverageStatus(impacts, covered)).toThrow(
      expect.objectContaining<Partial<LeavePolicyError>>({ code: 'INVALID_COVERAGE_COUNTS' }),
    );
  });
});
