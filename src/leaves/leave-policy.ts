export const LEAVE_DURATION_KINDS = ['hourly', 'full_day', 'multi_day'] as const;
export type LeaveDurationKind = (typeof LEAVE_DURATION_KINDS)[number];

export const LEAVE_REASON_CODES = ['annual_leave', 'administrative', 'health', 'other'] as const;
export type LeaveReasonCode = (typeof LEAVE_REASON_CODES)[number];

export const LEAVE_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];
export type LeaveDecision = Exclude<LeaveRequestStatus, 'pending'>;

export const LEAVE_COVERAGE_STATUSES = [
  'not_required',
  'unresolved',
  'partially_covered',
  'covered',
] as const;
export type LeaveCoverageStatus = (typeof LEAVE_COVERAGE_STATUSES)[number];

export type LeavePolicyErrorCode =
  | 'INVALID_LEAVE_STATE'
  | 'LEAVE_VERSION_MISMATCH'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'INVALID_COVERAGE_COUNTS';

export class LeavePolicyError extends Error {
  constructor(
    readonly code: LeavePolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LeavePolicyError';
  }
}

export interface LeaveDecisionInput {
  status: LeaveRequestStatus;
  coverageStatus: LeaveCoverageStatus;
  requesterUserId: string;
  decisionMakerUserId: string;
  currentVersion: number;
  expectedVersion: number;
  decision: LeaveDecision;
}

export interface LeaveDecisionResult {
  status: LeaveDecision;
  coverageStatus: LeaveCoverageStatus;
  version: number;
}

/**
 * Applies only the leave decision invariant. Coverage remains an independent
 * operational state and must never auto-approve a request.
 */
export function decideLeaveRequest(input: LeaveDecisionInput): LeaveDecisionResult {
  if (input.currentVersion !== input.expectedVersion) {
    throw new LeavePolicyError(
      'LEAVE_VERSION_MISMATCH',
      'Leave request version does not match the expected version',
    );
  }
  if (input.status !== 'pending') {
    throw new LeavePolicyError(
      'INVALID_LEAVE_STATE',
      'Only a pending leave request can be approved or rejected',
    );
  }
  if (input.requesterUserId === input.decisionMakerUserId) {
    throw new LeavePolicyError(
      'SELF_APPROVAL_FORBIDDEN',
      'A requester cannot decide their own leave request',
    );
  }

  return {
    status: input.decision,
    coverageStatus: input.coverageStatus,
    version: input.currentVersion + 1,
  };
}

export function deriveLeaveCoverageStatus(
  impactCount: number,
  coveredImpactCount: number,
): LeaveCoverageStatus {
  if (
    !Number.isInteger(impactCount) ||
    !Number.isInteger(coveredImpactCount) ||
    impactCount < 0 ||
    coveredImpactCount < 0 ||
    coveredImpactCount > impactCount
  ) {
    throw new LeavePolicyError(
      'INVALID_COVERAGE_COUNTS',
      'Coverage counts must be non-negative integers and covered count cannot exceed impact count',
    );
  }
  if (impactCount === 0) return 'not_required';
  if (coveredImpactCount === 0) return 'unresolved';
  if (coveredImpactCount < impactCount) return 'partially_covered';
  return 'covered';
}
