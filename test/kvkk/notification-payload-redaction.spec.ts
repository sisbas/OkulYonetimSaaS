import {
  minimizeNotificationAuditPayload,
  redactNotificationPayload,
} from '../../src/kvkk/notification-payload-redaction';

describe('Notification payload redaction', () => {
  it('redacts direct and nested notification payload PII', () => {
    expect(redactNotificationPayload({
      notificationId: 'n-1',
      parentPhone: '+905551112233',
      parentEmail: 'parent@example.com',
      messageBody: 'Student was absent today.',
      providerRawResponse: { token: 'provider-token', message: 'sent body' },
      metadata: { safe: 'operation-id' },
    })).toEqual({
      notificationId: 'n-1',
      parentPhone: '[REDACTED]',
      parentEmail: '[REDACTED]',
      messageBody: '[REDACTED]',
      providerRawResponse: '[REDACTED]',
      metadata: { safe: 'operation-id' },
    });
  });

  it('keeps audit payload minimized to routing and status metadata', () => {
    expect(minimizeNotificationAuditPayload({
      notificationId: 'n-1',
      tenantId: 'tenant-1',
      studentId: 'student-1',
      channel: 'sms',
      status: 'blocked_consent',
      reason: 'KVKK_CONSENT_REQUIRED',
      messageBody: 'Sensitive body',
      parentPhone: '+905551112233',
    })).toEqual({
      notificationId: 'n-1',
      tenantId: 'tenant-1',
      studentId: 'student-1',
      channel: 'sms',
      status: 'blocked_consent',
      reason: 'KVKK_CONSENT_REQUIRED',
    });
  });
});
