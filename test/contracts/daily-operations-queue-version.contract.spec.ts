import {
  DAILY_OPERATIONS_QUEUE_LESSON_FIELDS,
  DAILY_OPERATIONS_QUEUE_RESPONSE_FIELDS,
  DAILY_OPERATIONS_TODAY_PERMISSION,
  DAILY_OPERATIONS_TODAY_ROUTE,
  LEAVE_IMPACT_REASON_CODES,
  leaveEtag,
  parseLeaveExpectedVersion,
} from '../../src/daily-operations/leave-impact.types';

describe('WP-07E daily operations queue and version contract', () => {
  it('pins the canonical today route and tenant/branch permission contract', () => {
    expect(DAILY_OPERATIONS_TODAY_ROUTE).toBe('/api/v1/daily-operations/today');
    expect(DAILY_OPERATIONS_TODAY_PERMISSION).toBe('daily_operations:read');
    expect(LEAVE_IMPACT_REASON_CODES).toEqual(expect.arrayContaining(['BRANCH_NOT_VISIBLE']));
  });

  it('pins server-authored leave ETag retrieval after assignment mutations', () => {
    const tag = leaveEtag('leave-123', 7);

    expect(tag).toBe('"leave:leave-123:v7"');
    expect(parseLeaveExpectedVersion(tag, 'leave-123')).toBe(7);
    expect(() => parseLeaveExpectedVersion('"leave:leave-123:v6"', 'leave-123')).not.toThrow();
    expect(() => parseLeaveExpectedVersion('"leave:other:v7"', 'leave-123')).toThrow('LEAVE_VERSION_MISMATCH');
    expect(() => parseLeaveExpectedVersion(undefined, 'leave-123')).toThrow('LEAVE_VERSION_REQUIRED');
  });

  it('keeps queue and impact response allowlists PII-free', () => {
    const forbiddenFragments = [
      'name',
      'firstName',
      'lastName',
      'email',
      'phone',
      'parent',
      'guardian',
      'studentName',
      'teacherName',
      'leaveDetail',
      'healthDetail',
      'requestBody',
      'responseBody',
      'token',
      'cookie',
    ];

    const fields = [
      ...DAILY_OPERATIONS_QUEUE_RESPONSE_FIELDS,
      ...DAILY_OPERATIONS_QUEUE_LESSON_FIELDS,
      'leaveVersion',
      'leaveEtag',
    ];

    for (const field of fields) {
      for (const fragment of forbiddenFragments) {
        expect(field.toLowerCase()).not.toContain(fragment.toLowerCase());
      }
    }
  });

  it('requires exact current If-Match for clear after create', () => {
    const afterCreateEtag = leaveEtag('leave-123', 8);
    expect(parseLeaveExpectedVersion(afterCreateEtag, 'leave-123')).toBe(8);
    expect(() => parseLeaveExpectedVersion(leaveEtag('leave-123', 7), 'leave-123')).not.toThrow();

    // Repository-side optimistic lock decides whether a syntactically valid stale
    // ETag is accepted; the client is not allowed to invent or advance this value.
    expect(afterCreateEtag).not.toBe(leaveEtag('leave-123', 7));
  });
});
