import { Logger } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { CourseAuditService } from './course-audit.service';

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
  'description',
  'search',
];

describe('CourseAuditService', () => {
  const ctx: RequestContext = {
    requestId: 'req-1',
    tenantId: 'tenant-a',
    user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-admin'], permissions: ['course:create'] },
  };

  it('emits course audit events with allowlisted metadata only', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = new CourseAuditService();

    const event = service.emit(ctx, 'course.created', { courseId: 'course-1', changedFields: ['description', 'name'] });

    expect(event).toMatchObject({ eventName: 'course.created', resource: 'course', tenantId: 'tenant-a', actorId: 'user-1' });
    const serialized = String(logSpy.mock.calls[0][0]);
    expect(serialized).toContain('course.created');
    for (const forbidden of FORBIDDEN_KEYS.filter((key) => key !== 'description')) {
      expect(serialized).not.toContain(forbidden);
    }
    logSpy.mockRestore();
  });

  it('emits tenant.access_denied with allowlisted metadata only', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new CourseAuditService();

    const event = service.emitTenantAccessDenied(ctx, { resourceId: 'course-from-tenant-b' });

    expect(event).toEqual({
      eventName: 'tenant.access_denied',
      tenantId: 'tenant-a',
      actorId: 'user-1',
      requestId: 'req-1',
      resource: 'course',
      resourceId: 'course-from-tenant-b',
      outcome: 'denied',
      reasonCode: 'cross_tenant_resource',
    });
    const serialized = String(warnSpy.mock.calls[0][0]);
    expect(serialized).toContain('tenant.access_denied');
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(serialized).not.toContain(forbidden);
    }
    warnSpy.mockRestore();
  });
});
