import { Injectable, Logger } from '@nestjs/common';

import { RequestContext } from '../context/request-context';
import { RedactionReceipt } from './transactional-audit.types';

export type AuthorizationDeniedReasonCode =
  | 'missing_permission'
  | 'tenant_header_mismatch'
  | 'teacher_identity_unresolved';

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

// --- Genişletilmiş güvenlik/KVKK event tipleri (okul-03-audit-scope) ---

/** Başarısız kimlik doğrulama girişimi (hesap kilitleme nedeni dahil). */
export type AuthFailureAuditEvent = {
  eventName: 'auth.login.failure';
  tenantId?: string;
  actorId?: string;
  requestId: string;
  outcome: 'failure';
  failureReason: 'invalid_credentials' | 'account_disabled' | 'mfa_failed';
  failureCount: number;
};

/** Başarılı kimlik doğrulama. */
export type AuthSuccessAuditEvent = {
  eventName: 'auth.login.success' | 'auth.token_refreshed';
  tenantId?: string;
  actorId?: string;
  requestId: string;
  outcome: 'success';
  mfaMethod?: 'totp' | 'sms' | 'none';
};

/** Oturum kapatma. */
export type AuthLogoutAuditEvent = {
  eventName: 'auth.logout';
  tenantId?: string;
  actorId?: string;
  requestId: string;
  outcome: 'success';
};

/** Hesap kilitlenmesi (KVKK/brute-force koruması). */
export type AccountLockedAuditEvent = {
  eventName: 'auth.account_locked';
  tenantId?: string;
  actorId?: string;
  requestId: string;
  outcome: 'failure';
  lockReason: 'too_many_failures' | 'admin_action';
  failureCount: number;
};

export type SecurityAuditEvent =
  | AuthorizationDeniedAuditEvent
  | AuthFailureAuditEvent
  | AuthSuccessAuditEvent
  | AuthLogoutAuditEvent
  | AccountLockedAuditEvent;

// KVKK veri koruma (data-protection) event tipleri.
export type DataProtectionAuditEvent =
  | {
      eventName: 'dataprotection.export.redacted';
      tenantId: string;
      actorId: string;
      requestId: string;
      outcome: 'success';
      purpose: string;
      format: 'csv' | 'json' | 'pdf';
      recordCount: number;
      redactionReceipt: RedactionReceipt;
    }
  | {
      eventName: 'dataprotection.subject_access_request.served';
      tenantId: string;
      actorId: string;
      requestId: string;
      outcome: 'success';
      legalBasis: 'kvkk_article_11';
      recordCount: number;
      redactionReceipt: RedactionReceipt;
    }
  | {
      eventName: 'dataprotection.erasure.requested' | 'dataprotection.erasure.completed';
      tenantId: string;
      actorId: string;
      requestId: string;
      outcome: 'success' | 'failure';
      erasureScope: string;
      purpose: string;
    }
  | {
      eventName: 'dataprotection.consent.revoked';
      tenantId: string;
      actorId: string;
      requestId: string;
      outcome: 'success';
      purpose: string;
    };

// Omit'un union üzerinde dağılması için yardımcı (TS'in varsayılan Omit'u union'ı daraltır).
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

function actorIdFrom(ctx: RequestContext | undefined): string {
  const id = ctx?.user?.userId ?? ctx?.userId;
  if (!id) {
    throw new TypeError('SecurityAuditService: actorId (ctx.user.userId) is required for KVKK audit trail');
  }
  return id;
}

// KVKK denetim izi: tenantId ve actorId UUID olmalı; context eksikse kayıt
// reconcile edilemez, bu yüzden fail-fast (undefined/'unknown' fallback YOK).
function requireTenantId(ctx: RequestContext | undefined): string {
  const tenantId = ctx?.tenantId ?? ctx?.user?.tenantId;
  if (!tenantId) {
    throw new TypeError('SecurityAuditService: tenantId is required for KVKK audit trail');
  }
  return tenantId;
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
      tenantId: requireTenantId(ctx),
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

  // --- Genişletilmiş güvenlik event emitterları ---

  emitAuthFailure(
    ctx: RequestContext | undefined,
    input: {
      failureReason: AuthFailureAuditEvent['failureReason'];
      failureCount: number;
    },
  ): AuthFailureAuditEvent {
    const event: AuthFailureAuditEvent = {
      eventName: 'auth.login.failure',
      tenantId: requireTenantId(ctx),
      actorId: actorIdFrom(ctx),
      requestId: ctx?.requestId ?? 'unknown',
      outcome: 'failure',
      failureReason: input.failureReason,
      failureCount: input.failureCount,
    };
    this.logger.warn(JSON.stringify(event));
    return event;
  }

  emitAuthSuccess(
    ctx: RequestContext | undefined,
    input: { eventName: AuthSuccessAuditEvent['eventName']; mfaMethod?: AuthSuccessAuditEvent['mfaMethod'] },
  ): AuthSuccessAuditEvent {
    const event: AuthSuccessAuditEvent = {
      eventName: input.eventName,
      tenantId: requireTenantId(ctx),
      actorId: actorIdFrom(ctx),
      requestId: ctx?.requestId ?? 'unknown',
      outcome: 'success',
      ...(input.mfaMethod !== undefined ? { mfaMethod: input.mfaMethod } : {}),
    };
    this.logger.log(JSON.stringify(event));
    return event;
  }

  emitAuthLogout(ctx: RequestContext | undefined): AuthLogoutAuditEvent {
    const event: AuthLogoutAuditEvent = {
      eventName: 'auth.logout',
      tenantId: requireTenantId(ctx),
      actorId: actorIdFrom(ctx),
      requestId: ctx?.requestId ?? 'unknown',
      outcome: 'success',
    };
    this.logger.log(JSON.stringify(event));
    return event;
  }

  emitAccountLocked(
    ctx: RequestContext | undefined,
    input: { lockReason: AccountLockedAuditEvent['lockReason']; failureCount: number },
  ): AccountLockedAuditEvent {
    const event: AccountLockedAuditEvent = {
      eventName: 'auth.account_locked',
      tenantId: requireTenantId(ctx),
      actorId: actorIdFrom(ctx),
      requestId: ctx?.requestId ?? 'unknown',
      outcome: 'failure',
      lockReason: input.lockReason,
      failureCount: input.failureCount,
    };
    this.logger.warn(JSON.stringify(event));
    return event;
  }

  // --- KVKK veri koruma event emitterları ---

  emitDataProtectionEvent(
    ctx: RequestContext | undefined,
    input: DistributiveOmit<DataProtectionAuditEvent, 'tenantId' | 'actorId' | 'requestId'>,
  ): DataProtectionAuditEvent {
    const event = {
      ...input,
      tenantId: requireTenantId(ctx),
      actorId: actorIdFrom(ctx),
      requestId: ctx?.requestId ?? 'unknown',
    } as DataProtectionAuditEvent;
    this.logger.log(JSON.stringify(event));
    return event;
  }
}
