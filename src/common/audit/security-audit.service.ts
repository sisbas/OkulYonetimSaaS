import { Injectable, Logger } from '@nestjs/common';

import { RequestContext } from '../context/request-context';

export type AuthorizationDeniedReasonCode = 'missing_permission' | 'tenant_header_mismatch';

export type AuthorizationDeniedAuditEvent = {
  eventName: 'authorization.denied';
  tenantId?: string;
  actorId?: string;
  requestId: string;
  resource: string;
  requiredPermission: string[];
  outcome: 'denied';
  reasonCode: AuthorizationDeniedReasonCode;
};

function actorIdFrom(ctx: RequestContext | undefined): string | undefined {
  return ctx?.user?.userId ?? ctx?.userId;
}

export function resourceFromPermission(permission: string | undefined): string {
  return permission?.split(':')[0] || 'unknown';
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  emitAuthorizationDenied(
    ctx: RequestContext | undefined,
    input: {
      requiredPermission: string[];
      resource?: string;
      reasonCode: AuthorizationDeniedReasonCode;
    },
  ): AuthorizationDeniedAuditEvent {
    const event: AuthorizationDeniedAuditEvent = {
      eventName: 'authorization.denied',
      tenantId: ctx?.tenantId ?? ctx?.user?.tenantId,
      actorId: actorIdFrom(ctx),
      requestId: ctx?.requestId ?? 'unknown',
      resource: input.resource ?? resourceFromPermission(input.requiredPermission[0]),
      requiredPermission: [...input.requiredPermission].sort(),
      outcome: 'denied',
      reasonCode: input.reasonCode,
    };
    this.logger.warn(JSON.stringify(event));
    return event;
  }
}
