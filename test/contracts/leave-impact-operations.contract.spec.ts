import {
  LEAVE_IMPACT_REASON_CODES,
  computeCoverageStatus,
  eventOccurrenceForRange,
  projectionKey,
} from '../../src/daily-operations/leave-impact.types';
import { FORBIDDEN_AUDIT_METADATA_KEYS } from '../../src/common/audit/audit-metadata-policy';
import { LEAVE_SUCCESS_AUDIT_EVENT_NAMES } from '../../src/common/audit/transactional-audit.types';
import { LeaveCoverageStatus } from '../../src/leaves/leave-request.entity';

describe('WP-07E leave impact operations contract', () => {
  it('keeps coverage states separate from decision state', () => {
    expect(computeCoverageStatus(0, 0)).toBe(LeaveCoverageStatus.NOT_REQUIRED);
    expect(computeCoverageStatus(2, 0)).toBe(LeaveCoverageStatus.UNRESOLVED);
    expect(computeCoverageStatus(2, 1)).toBe(LeaveCoverageStatus.PARTIALLY_COVERED);
    expect(computeCoverageStatus(2, 2)).toBe(LeaveCoverageStatus.COVERED);
  });

  it('uses replay-safe projection keys', () => {
    expect(projectionKey({
      leaveRequestId: 'leave-1',
      scheduleVersionId: 'version-1',
      scheduleEventId: 'event-1',
    })).toBe('leave:leave-1:version:version-1:event:event-1');
  });

  it('detects deterministic leave/event date-time overlap', () => {
    const hit = eventOccurrenceForRange({
      leaveStartsAt: new Date('2026-09-14T08:30:00.000Z'),
      leaveEndsAt: new Date('2026-09-14T10:30:00.000Z'),
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-12-31',
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
    });
    expect(hit?.occurrenceDate).toBe('2026-09-14');

    const miss = eventOccurrenceForRange({
      leaveStartsAt: new Date('2026-09-14T10:30:00.000Z'),
      leaveEndsAt: new Date('2026-09-14T11:30:00.000Z'),
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-12-31',
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
    });
    expect(miss).toBeNull();
  });

  it('pins reason codes required by the #144 contract', () => {
    expect(LEAVE_IMPACT_REASON_CODES).toEqual(expect.arrayContaining([
      'TEACHER_COURSE_ELIGIBILITY_NOT_READY',
      'TEACHER_COURSE_MISMATCH',
      'SUBSTITUTE_LEAVE_OVERLAP',
      'SUBSTITUTE_TIME_CONFLICT',
      'LEAVE_VERSION_REQUIRED',
      'LEAVE_VERSION_MISMATCH',
    ]));
  });

  it('pins PII-free audit policy for impact and projection events', () => {
    expect(LEAVE_SUCCESS_AUDIT_EVENT_NAMES).toEqual(expect.arrayContaining([
      'leave.substitution_assigned.v1',
      'leave.substitution_cleared.v1',
      'daily_operations.projected.v1',
    ]));
    expect(FORBIDDEN_AUDIT_METADATA_KEYS).toEqual(expect.arrayContaining([
      'teacherName',
      'teacherEmail',
      'teacherPhone',
      'leaveDetail',
      'healthDetail',
      'freeTextReason',
      'requestBody',
      'responseBody',
    ]));
  });
});
