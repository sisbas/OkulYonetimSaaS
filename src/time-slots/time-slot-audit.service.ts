import { Injectable, Logger } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';

export type TimeSlotSuccessAuditEventName =
  | 'time_slot.created'
  | 'time_slot.updated'
  | 'time_slot.archived'
  | 'time_slot.reactivated';
export type TimeSlotAuditEventName = TimeSlotSuccessAuditEventName | 'time_slot.access_denied';
export type TimeSlotAccessDeniedReason = 'branch_not_visible' | 'time_slot_not_visible';

export type TimeSlotAuditEvent = {
  eventName: TimeSlotAuditEventName;
  resource: 'time_slot';
  timeSlotId?: string;
  tenantId?: string;
  branchId?: string;
  actorId?: string;
  requestId: string;
  changedFields: string[];
  result: 'success' | 'denied';
  reasonCode?: TimeSlotAccessDeniedReason;
};

function actorIdFrom(ctx: RequestContext): string | undefined {
  return ctx.user?.userId ?? ctx.userId;
}

@Injectable()
export class TimeSlotAuditService {
  private readonly logger = new Logger(TimeSlotAuditService.name);

  emit(
    ctx: RequestContext,
    eventName: TimeSlotSuccessAuditEventName,
    input: { timeSlotId: string; branchId: string; changedFields: string[] },
  ): TimeSlotAuditEvent {
    const event: TimeSlotAuditEvent = {
      eventName,
      resource: 'time_slot',
      timeSlotId: input.timeSlotId,
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      actorId: actorIdFrom(ctx),
      requestId: ctx.requestId,
      changedFields: [...input.changedFields].sort(),
      result: 'success',
    };
    this.logger.log(JSON.stringify(event));
    return event;
  }

  emitAccessDenied(
    ctx: RequestContext,
    input: { timeSlotId?: string; branchId?: string; reasonCode: TimeSlotAccessDeniedReason },
  ): TimeSlotAuditEvent {
    const event: TimeSlotAuditEvent = {
      eventName: 'time_slot.access_denied',
      resource: 'time_slot',
      timeSlotId: input.timeSlotId,
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      actorId: actorIdFrom(ctx),
      requestId: ctx.requestId,
      changedFields: [],
      result: 'denied',
      reasonCode: input.reasonCode,
    };
    this.logger.warn(JSON.stringify(event));
    return event;
  }
}
