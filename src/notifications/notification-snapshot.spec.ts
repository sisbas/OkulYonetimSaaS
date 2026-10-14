import {
  buildNotificationSnapshot,
  NotificationSnapshot,
} from './notification-snapshot';

describe('buildNotificationSnapshot', () => {
  const baseInput = {
    sessionRef: 'p1:session:abc123',
    studentRef: 'p1:student:def456',
    attendanceStatus: 'absent',
    sessionStatus: 'locked',
    channel: 'sms',
    consentApproved: true,
    consentReason: null,
    consentId: 'consent-uuid-1',
    consentVersion: 2,
    eventType: 'attendance.absent.locked',
  };

  it('builds a complete immutable snapshot', () => {
    const snapshot = buildNotificationSnapshot(baseInput);
    expect(snapshot.source.sessionRef).toBe('p1:session:abc123');
    expect(snapshot.source.studentRef).toBe('p1:student:def456');
    expect(snapshot.source.attendanceStatus).toBe('absent');
    expect(snapshot.source.sessionStatus).toBe('locked');
    expect(snapshot.contact.channel).toBe('sms');
    expect(snapshot.contact.maskedDisplay).toBeNull();
    expect(snapshot.contact.verificationStatus).toBeNull();
    expect(snapshot.consent.approved).toBe(true);
    expect(snapshot.consent.reason).toBeNull();
    expect(snapshot.consent.consentId).toBe('consent-uuid-1');
    expect(snapshot.consent.consentVersion).toBe(2);
    expect(snapshot.template.eventType).toBe('attendance.absent.locked');
    expect(snapshot.template.channel).toBe('sms');
    expect(snapshot.template.templateRef).toBe('attendance.absent.locked:sms');
    expect(snapshot.enqueuedAt).toBeDefined();
  });

  it('includes masked display and verification status when provided', () => {
    const snapshot = buildNotificationSnapshot({
      ...baseInput,
      maskedDisplay: '+90 532 *** ** 12',
      verificationStatus: 'verified',
    });
    expect(snapshot.contact.maskedDisplay).toBe('+90 532 *** ** 12');
    expect(snapshot.contact.verificationStatus).toBe('verified');
  });

  it('captures blocked consent decision', () => {
    const snapshot = buildNotificationSnapshot({
      ...baseInput,
      consentApproved: false,
      consentReason: 'blocked_consent',
      consentId: 'consent-uuid-2',
      consentVersion: 3,
    });
    expect(snapshot.consent.approved).toBe(false);
    expect(snapshot.consent.reason).toBe('blocked_consent');
    expect(snapshot.consent.consentId).toBe('consent-uuid-2');
    expect(snapshot.consent.consentVersion).toBe(3);
  });

  it('uses provided enqueuedAt or defaults to now', () => {
    const fixedDate = new Date('2026-10-05T12:00:00Z');
    const snapshot = buildNotificationSnapshot({
      ...baseInput,
      enqueuedAt: fixedDate,
    });
    expect(snapshot.enqueuedAt).toBe('2026-10-05T12:00:00.000Z');
  });

  it('does not contain raw PII (no raw UUIDs)', () => {
    const snapshot = buildNotificationSnapshot(baseInput);
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('rawId');
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('student_id');
    expect(json).not.toContain('session_id');
  });

  it('produces immutable result (frozen)', () => {
    const snapshot = buildNotificationSnapshot(baseInput);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.source)).toBe(true);
    expect(Object.isFrozen(snapshot.contact)).toBe(true);
    expect(Object.isFrozen(snapshot.consent)).toBe(true);
    expect(Object.isFrozen(snapshot.template)).toBe(true);
  });
});
