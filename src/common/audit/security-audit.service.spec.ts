import { SecurityAuditService } from './security-audit.service';

const FORBIDDEN_KEYS = new Set([
  'requestBody',
  'responseBody',
  'authorization',
  'cookie',
  'token',
  'password',
  'credential',
  'email',
  'phone',
  'parentPhone',
  'parentEmail',
  'guardianContact',
  'messageBody',
  'notificationPayload',
  'guidanceNote',
  'studentName',
  'parentName',
  'teacherName',
]);

function expectNoForbiddenKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const nested of value) expectNoForbiddenKeys(nested);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    expect(FORBIDDEN_KEYS.has(key)).toBe(false);
    expectNoForbiddenKeys(nested);
  }
}

const CTX = {
  requestId: 'req-1',
  tenantId: 'tenant-a',
  user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['teacher'], permissions: ['course:read'] },
};

describe('SecurityAuditService', () => {
  it('persists authorization.denied with allowlisted metadata only', () => {
    const service = new SecurityAuditService();
    const event = service.emitAuthorizationDenied(CTX, {
      requiredPermission: ['course:create'],
      reasonCode: 'missing_permission',
    });

    expect(event).toEqual({
      eventName: 'authorization.denied',
      tenantId: 'tenant-a',
      actorId: 'user-1',
      requestId: 'req-1',
      resource: 'course',
      requiredPermission: ['course:create'],
      outcome: 'denied',
      reasonCode: 'missing_permission',
    });

    expectNoForbiddenKeys(event);
  });

  it('emits auth login failure with non-PII security metrics', () => {
    const service = new SecurityAuditService();
    const event = service.emitAuthFailure(CTX, { failureReason: 'invalid_credentials', failureCount: 3 });

    expect(event).toEqual({
      eventName: 'auth.login.failure',
      tenantId: 'tenant-a',
      actorId: 'user-1',
      requestId: 'req-1',
      outcome: 'failure',
      failureReason: 'invalid_credentials',
      failureCount: 3,
    });
    expectNoForbiddenKeys(event);
  });

  it('emits auth success with optional mfa method', () => {
    const service = new SecurityAuditService();
    const event = service.emitAuthSuccess(CTX, { eventName: 'auth.login.success', mfaMethod: 'totp' });

    expect(event).toMatchObject({
      eventName: 'auth.login.success',
      outcome: 'success',
      mfaMethod: 'totp',
    });
    expectNoForbiddenKeys(event);
  });

  it('emits auth logout', () => {
    const service = new SecurityAuditService();
    const event = service.emitAuthLogout(CTX);

    expect(event).toMatchObject({ eventName: 'auth.logout', outcome: 'success' });
    expectNoForbiddenKeys(event);
  });

  it('emits account locked on brute-force', () => {
    const service = new SecurityAuditService();
    const event = service.emitAccountLocked(CTX, { lockReason: 'too_many_failures', failureCount: 5 });

    expect(event).toMatchObject({
      eventName: 'auth.account_locked',
      outcome: 'failure',
      lockReason: 'too_many_failures',
      failureCount: 5,
    });
    expectNoForbiddenKeys(event);
  });

  it('emits KVKK data-protection export event carrying a redaction receipt', () => {
    const service = new SecurityAuditService();
    const event = service.emitDataProtectionEvent(CTX, {
      eventName: 'dataprotection.export.redacted',
      outcome: 'success',
      purpose: 'regulatory_export',
      format: 'csv',
      recordCount: 12,
      redactionReceipt: {
        redactedFieldCount: 4,
        skippedFieldCount: 8,
        evaluatedFieldCount: 12,
        strategy: 'full-redact',
        appliedAt: '2026-08-13T00:00:00.000Z',
      },
    });

    expect(event).toMatchObject({
      eventName: 'dataprotection.export.redacted',
      tenantId: 'tenant-a',
      actorId: 'user-1',
      recordCount: 12,
      redactionReceipt: { evaluatedFieldCount: 12 },
    });
    expectNoForbiddenKeys(event);
  });
});
