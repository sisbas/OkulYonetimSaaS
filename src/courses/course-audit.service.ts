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

@Injectable()
export class CourseAuditService {
  private readonly logger = new Logger(CourseAuditService.name);

  emit(ctx: RequestContext, eventName: CourseAuditEventName, input: { courseId: string; changedFields: string[] }): CourseAuditEvent {
    const event: CourseAuditEvent = {
      eventName,
      resource: 'course',
      tenantId: ctx.tenantId,
      actorId: ctx.user?.userId ?? ctx.userId,
      requestId: ctx.requestId,
      courseId: input.courseId,
      changedFields: [...input.changedFields].sort(),
      result: 'success',
    };
    this.logger.log(JSON.stringify(event));
    return event;
  }
}
