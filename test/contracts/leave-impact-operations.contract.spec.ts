import {
  LEAVE_IMPACT_REASON_CODES,
  computeCoverageStatus,
  eventOccurrenceForRange,
  eventOccurrencesForRange,
  projectionKey,
} from '../../src/daily-operations/leave-impact.types';
import { FORBIDDEN_AUDIT_METADATA_KEYS } from '../../src/common/audit/audit-metadata-policy';
import { LEAVE_SUCCESS_AUDIT_EVENT_NAMES } from '../../src/common/audit/transactional-audit.types';
import { LeaveCoverageStatus } from '../../src/leaves/leave-request.entity';

describe('WP-07E leave impact operations contract', () => {
  it('pins coverage and occurrence-scoped projection key behavior', () => {
    expect([0, 0, 2, 1].map((_, index) => [
      computeCoverageStatus(0, 0),
      computeCoverageStatus(2, 0),
      computeCoverageStatus(2, 1),
      computeCoverageStatus(2, 2),
    ][index])).toEqual([
      LeaveCoverageStatus.NOT_REQUIRED,
      LeaveCoverageStatus.UNRESOLVED,
      LeaveCoverageStatus.PARTIALLY_COVERED,
      LeaveCoverageStatus.COVERED,
    ]);
    expect(projectionKey({
      leaveRequestId: 'leave-1',
      scheduleVersionId: 'version-1',
      scheduleEventId: 'event-1',
      occurrenceDate: '2026-09-14',
    })).toBe('leave:leave-1:version:version-1:event:event-1:date:2026-09-14');
  });

  it('expands every matching weekly occurrence in the tenant timezone', () => {
    const occurrences = eventOccurrencesForRange({
      leaveStartsAt: new Date('2026-09-14T05:30:00.000Z'),
      leaveEndsAt: new Date('2026-09-28T07:30:00.000Z'),
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-12-31',
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
    });

    expect(occurrences.map((occurrence) => occurrence.occurrenceDate)).toEqual([
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    expect(occurrences[0].startsAt.toISOString()).toBe('2026-09-14T06:00:00.000Z');
    expect(occurrences[0].endsAt.toISOString()).toBe('2026-09-14T07:00:00.000Z');
    expect(eventOccurrenceForRange({
      leaveStartsAt: new Date('2026-09-14T05:30:00.000Z'),
      leaveEndsAt: new Date('2026-09-14T07:30:00.000Z'),
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-12-31',
      dayOfWeek: 1,
      startTime: '09:00:00',
      endTime: '10:00:00',
    })?.occurrenceDate).toBe('2026-09-14');
  });

  it('pins reason codes, audit events and forbidden PII keys', () => {
    expect(LEAVE_IMPACT_REASON_CODES).toEqual(expect.arrayContaining(['TEACHER_COURSE_ELIGIBILITY_NOT_READY', 'TEACHER_COURSE_MISMATCH', 'SUBSTITUTE_LEAVE_OVERLAP', 'SUBSTITUTE_TIME_CONFLICT', 'LEAVE_VERSION_REQUIRED', 'LEAVE_VERSION_MISMATCH']));
    expect(LEAVE_SUCCESS_AUDIT_EVENT_NAMES).toEqual(expect.arrayContaining(['leave.substitution_assigned.v1', 'leave.substitution_cleared.v1', 'daily_operations.projected.v1']));
    expect(FORBIDDEN_AUDIT_METADATA_KEYS).toEqual(expect.arrayContaining(['teacherName', 'teacherEmail', 'teacherPhone', 'leaveDetail', 'healthDetail', 'freeTextReason', 'requestBody', 'responseBody']));
  });
});
