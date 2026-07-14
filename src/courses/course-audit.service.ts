import { Injectable, Logger } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';

export type CourseAuditEventName = 'course.created' | 'course.updated' | 'course.deactivated' | 'course.reactivated';

export type CourseAuditEvent = {
  eventName: CourseAuditEventName;
  resource: 'course';
  tenantId?: string;
  actorId?: string;
  requestId: string;
  courseId: string;
  changedFields: string[];
  result: 'success';
};

export type CourseTenantAccessDeniedAuditEvent = {
  eventName: 'tenant.access_denied';
  tenantId?: string;
  actorId?: string;
  requestId: string;
  resource: 'course';
  resourceId: string;
  outcome: 'denied';
  reasonCode: 'cross_tenant_resource';
};

function actorIdFrom(ctx: RequestContext): string | undefined {
  return ctx.user?.userId ?? ctx.userId;
}

@Injectable()
export class CourseAuditService {
  private readonly logger = new Logger(CourseAuditService.name);

  emit(ctx: RequestContext, eventName: CourseAuditEventName, input: { courseId: string; changedFields: string[] }): CourseAuditEvent {
    const event: CourseAuditEvent = {
      eventName,
      resource: 'course',
      tenantId: ctx.tenantId,
      actorId: actorIdFrom(ctx),
      requestId: ctx.requestId,
      courseId: input.courseId,
      changedFields: [...input.changedFields].sort(),
      result: 'success',
    };
    this.logger.log(JSON.stringify(event));
    return event;
  }

  emitTenantAccessDenied(ctx: RequestContext, input: { resourceId: string }): CourseTenantAccessDeniedAuditEvent {
    const event: CourseTenantAccessDeniedAuditEvent = {
      eventName: 'tenant.access_denied',
      tenantId: ctx.tenantId,
      actorId: actorIdFrom(ctx),
      requestId: ctx.requestId,
      resource: 'course',
      resourceId: input.resourceId,
      outcome: 'denied',
      reasonCode: 'cross_tenant_resource',
    };
    this.logger.warn(JSON.stringify(event));
    return event;
  }
}
