import { Logger } from '@nestjs/common';

import { RequestContext } from './request-context';
import { DenyReasonCode } from './deny-response';

/**
 * Yetki/bağlam kararlarının denetim (audit) kaydı — allowlist + redaksiyon
 * (#339 R4, madde 6).
 *
 * Kural: audit olayına YALNIZCA aşağıdaki allowlist alanları girer. Gövde,
 * başlık, token, çerez, e-posta, telefon, ad-soyad, şube/kurum adı gibi
 * alanlar allowlist dışıdır ve olaydan tamamen atılır; allowlist içindeki bir
 * alan hassas görünümlü bir değer taşıyorsa `[redacted]` ile maskelenir.
 */
export const CONTEXT_AUDIT_METADATA_ALLOWLIST = [
  'eventName',
  'outcome',
  'reasonCode',
  'requestId',
  'tenantId',
  'actorId',
  'resource',
  'requiredPermission',
  'contextVersion',
  'resolution',
  'cache',
  'branchScoped',
  'roleCount',
  'permissionCount',
] as const;

/** Audit kaydına asla girmemesi gereken alanlar (negatif testler için açık liste). */
export const CONTEXT_AUDIT_FORBIDDEN_KEYS = [
  'body',
  'headers',
  'authorization',
  'cookie',
  'accessToken',
  'refreshToken',
  'password',
  'credentialHash',
  'email',
  'phone',
  'fullName',
  'firstName',
  'lastName',
  'studentName',
  'branchName',
  'tenantName',
  'data',
] as const;

const REDACTED = '[redacted]';

const SENSITIVE_VALUE_PATTERNS: ReadonlyArray<RegExp> = [
  /^bearer\s/i,
  /^eyJ[A-Za-z0-9_-]{8,}/, // JWT benzeri
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // e-posta
  /^\+?\d[\d\s().-]{7,}$/, // telefon benzeri
];

function isSensitiveValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value.trim()));
  }
  return false;
}

/**
 * Allowlist dışı anahtarları atar, allowlist içi hassas değerleri maskeler.
 * Dizi değerler de aynı kurala tabidir.
 */
export function redactContextAuditMetadata(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set<string>(CONTEXT_AUDIT_METADATA_ALLOWLIST);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      output[key] = value.map((entry) => (isSensitiveValue(entry) ? REDACTED : entry));
      continue;
    }
    output[key] = isSensitiveValue(value) ? REDACTED : value;
  }
  return output;
}

export type ContextAuditEventInput = {
  reasonCode: DenyReasonCode | 'tenant_header_mismatch';
  context?: RequestContext;
  resource?: string;
  requiredPermission?: ReadonlyArray<string>;
  branchScoped?: boolean;
};

export type ContextAuditEvent = Record<string, unknown> & {
  eventName: 'security.context.denied';
  outcome: 'denied';
};

/** Olayı allowlist + redaksiyon ile üretir (yan etkisiz, test edilebilir). */
export function buildContextAuditEvent(input: ContextAuditEventInput): ContextAuditEvent {
  const context = input.context;
  return redactContextAuditMetadata({
    eventName: 'security.context.denied',
    outcome: 'denied',
    reasonCode: input.reasonCode,
    requestId: context?.requestId ?? 'unknown',
    tenantId: context?.tenantId,
    actorId: context?.userId,
    resource: input.resource,
    requiredPermission: input.requiredPermission ? [...input.requiredPermission] : undefined,
    contextVersion: context?.contextVersion,
    resolution: context?.authorization?.resolvedFrom,
    cache: context?.authorization?.cache,
    branchScoped: input.branchScoped,
    roleCount: context?.roles?.length,
    permissionCount: context?.permissions?.length,
  }) as ContextAuditEvent;
}

/** Olayı yapılandırılmış (JSON) log olarak yayınlar. PII/secret içermez. */
export function emitContextAuditEvent(
  logger: Pick<Logger, 'warn'>,
  input: ContextAuditEventInput,
): ContextAuditEvent {
  const event = buildContextAuditEvent(input);
  logger.warn(JSON.stringify(event));
  return event;
}

/**
 * Genişletilmiş deny sebebini mevcut güvenlik audit kanalının desteklediği
 * koda eşler (tek olay/kayıt ilkesi: aynı red için iki kayıt üretilmez).
 */
export function legacySecurityAuditReasonCode(
  reasonCode: DenyReasonCode | 'tenant_header_mismatch',
): 'missing_permission' | 'tenant_header_mismatch' | null {
  if (reasonCode === 'missing_permission') return 'missing_permission';
  if (reasonCode === 'tenant_header_mismatch') return 'tenant_header_mismatch';
  if (reasonCode === 'client_authority_rejected') return 'tenant_header_mismatch';
  return null;
}
