import { SecurityAuditService } from './security-audit.service';

const FORBIDDEN_KEYS = [
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
];

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

    const serialized = JSON.stringify(event);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
