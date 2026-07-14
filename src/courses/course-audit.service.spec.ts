import { Logger } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { CourseAuditService } from './course-audit.service';

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
    expect(serialized).not.toContain('requestBody');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('phone');
    logSpy.mockRestore();
  });
});
