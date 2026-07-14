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

describe('SecurityAuditService', () => {
  it('persists authorization.denied with allowlisted metadata only', () => {
    const service = new SecurityAuditService();
    const event = service.emitAuthorizationDenied(
      {
        requestId: 'req-1',
        tenantId: 'tenant-a',
        user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['teacher'], permissions: ['course:read'] },
      },
      { requiredPermission: ['course:create'], reasonCode: 'missing_permission' },
    );

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
});
