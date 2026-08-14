import { isSensitiveKey, REDACTED, redactObject } from './redaction-registry';

// OKUL-04: SENSITIVE_NOTIFICATION_KEYS artık merkezi registry'den türetilir.
// Sadece bildirim katmanına özgü ek alanlar burada tanımlı (notification
// payload'larında sıkça geçen channel-specific key'ler).
const NOTIFICATION_EXTRA_KEYS = [
  'parentphone',
  'parentemail',
  'guardianphone',
  'guardianemail',
  'parentcontact',
  'guardiancontact',
] as const;

const NOTIFICATION_SENSITIVE_KEYS: ReadonlySet<string> = new Set<string>([
  ...NOTIFICATION_EXTRA_KEYS,
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveNotificationKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return isSensitiveKey(key) || NOTIFICATION_SENSITIVE_KEYS.has(normalized);
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

// Geriye dönük uyumluluk: eski direkt kullanımlar redactObject'a yönlenir.
export { redactObject };
