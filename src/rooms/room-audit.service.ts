import { Injectable, Logger } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';

export type RoomSuccessAuditEventName = 'room.created' | 'room.updated' | 'room.archived' | 'room.reactivated';
export type RoomAuditEventName = RoomSuccessAuditEventName | 'room.access_denied';

export type RoomAuditResult = 'success' | 'denied';

export type RoomAuditEvent = {
  eventName: RoomAuditEventName;
  resource: 'room';
  tenantId?: string;
  branchId?: string;
  actorId?: string;
  requestId: string;
  roomId?: string;
  changedFields: string[];
  result: RoomAuditResult;
};

function actorIdFrom(ctx: RequestContext): string | undefined {
  return ctx.user?.userId ?? ctx.userId;
}

@Injectable()
export class RoomAuditService {
  private readonly logger = new Logger(RoomAuditService.name);

  emit(ctx: RequestContext, eventName: RoomSuccessAuditEventName, input: { roomId: string; branchId: string; changedFields: string[] }): RoomAuditEvent {
    const event: RoomAuditEvent = {
      eventName,
      resource: 'room',
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      actorId: actorIdFrom(ctx),
      requestId: ctx.requestId,
      roomId: input.roomId,
      changedFields: [...input.changedFields].sort(),
      result: 'success',
    };
    this.logger.log(JSON.stringify(event));
    return event;
  }

  emitAccessDenied(ctx: RequestContext, input: { roomId?: string; branchId?: string }): RoomAuditEvent {
    const event: RoomAuditEvent = {
      eventName: 'room.access_denied',
      resource: 'room',
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      actorId: actorIdFrom(ctx),
      requestId: ctx.requestId,
      roomId: input.roomId,
      changedFields: [],
      result: 'denied',
    };
    this.logger.warn(JSON.stringify(event));
    return event;
  }

  emitTenantAccessDenied(ctx: RequestContext, input: { roomId: string }): RoomAuditEvent {
    return this.emitAccessDenied(ctx, input);
  }
}
