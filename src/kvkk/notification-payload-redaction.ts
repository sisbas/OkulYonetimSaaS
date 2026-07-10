const REDACTED = '[REDACTED]';

const SENSITIVE_NOTIFICATION_KEYS = [
  'phone',
  'email',
  'parentphone',
  'parentemail',
  'guardianphone',
  'guardianemail',
  'parentcontact',
  'guardiancontact',
  'messagebody',
  'message',
  'payload',
  'providerrawresponse',
  'rawresponse',
  'token',
  'credential',
  'secret',
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveNotificationKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_NOTIFICATION_KEYS.some((pattern) => normalized.includes(pattern));
}

export function redactNotificationPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactNotificationPayload);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      isSensitiveNotificationKey(key) ? REDACTED : redactNotificationPayload(nested),
    ]),
  );
}

export function minimizeNotificationAuditPayload(value: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactNotificationPayload(value) as Record<string, unknown>;
  return {
    notificationId: redacted.notificationId,
    tenantId: redacted.tenantId,
    studentId: redacted.studentId,
    channel: redacted.channel,
    status: redacted.status,
    reason: redacted.reason,
  };
}
