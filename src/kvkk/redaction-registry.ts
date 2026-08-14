/**
 * KVKK Merkezi Redaction Registry (OKUL-04)
 * -----------------------------------------
 * Tüm PII / hassas veri alan adlarının TEK KAYNAĞI. Audit export, KVKK
 * notification payload, ve (gelecekte) API response serializer katmanları
 * bu registry'den türetilir. Böylece bir alan eklendiğinde tek noktadan
 * tüm maskeleme katmanları güncellenir — OKUL-03 P1 bulgusunun ("export
 * redaction forbidden key'leri kaçırıyor") kök nedeni ortadan kalkar.
 *
 * Alan adları ham (camelCase) formda tutulur; lookup anında normalize
 * edilir (lowercase + alfanumerik), böylece `Email` / `ParentEmail` /
 * `parent_email` gibi varyantlar da yakalanır.
 */

const REDACTED = '[REDACTED]';

// Doğrudan tanımlayıcı / özel nitelikli kişisel veri (KVKK kapsamı).
const IDENTITY_KEYS = [
  'studentName',
  'studentIdentity',
  'studentTcKimlikNo',
  'nationalId',
  'identityNumber',
  'tcKimlikNo',
  'birthDate',
  'address',
  'iban',
  'parentName',
  'parentPhone',
  'parentEmail',
  'parentContact',
  'guardianName',
  'guardianPhone',
  'guardianEmail',
  'guardianContact',
  'teacherName',
  'teacherEmail',
  'teacherPhone',
] as const;

// Kimlik bilgisi / gizli değer (credential, token, secret).
const SECRET_KEYS = [
  'password',
  'credential',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'authorization',
  'cookie',
  'setCookie',
  'requestBody',
] as const;

// Sağlık / özel hayat (özel nitelikli kişisel veri).
const HEALTH_KEYS = [
  'healthDetail',
  'healthInfo',
  'healthNote',
  'medicalNote',
  'diagnosis',
  'leaveDetail',
  'freeTextReason',
] as const;

// İletişim / mesaj gövdesi (notification + audit ortak).
// Compound key'ler (recipientPhone, destinationEmail, providerAuthToken vb.)
// açıkça tanımlı — exact-membership lookup ile de yakalansınlar.
const MESSAGE_KEYS = [
  'email',
  'phone',
  'messageBody',
  'message',
  'payload',
  'providerRawResponse',
  'rawResponse',
  'notificationBody',
  'notificationPayload',
  'guidanceNote',
  'counselingNote',
  // Compound notification/provider alan adları (KVKK PII sızıntısı kök nedeni).
  'recipientPhone',
  'recipientEmail',
  'destinationPhone',
  'destinationEmail',
  'providerAuthToken',
  'providerApiKey',
  'senderPhone',
  'senderEmail',
] as const;

export const REDACTION_FIELDS: ReadonlySet<string> = new Set<string>([
  ...IDENTITY_KEYS,
  ...SECRET_KEYS,
  ...HEALTH_KEYS,
  ...MESSAGE_KEYS,
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const REDACTION_FIELDS_NORMALIZED: ReadonlySet<string> = new Set(
  [...REDACTION_FIELDS].map(normalizeKey),
);

/** Bir alan adının (herhangi bir case/varyantla) maskelenmesi gerekip gerekmediği. */
export function isSensitiveKey(key: string): boolean {
  return REDACTION_FIELDS_NORMALIZED.has(normalizeKey(key));
}

/** Bir değer için KVKK maskesi uygular; hassas değilse değer olduğu gibi döner. */
export function redactValue(key: string, value: unknown): unknown {
  return isSensitiveKey(key) ? REDACTED : value;
}

/**
 * Bir nesneyi özyinelemeli olarak KVKK maskesinden geçirir.
 * Orijinal nesneyi mutasyona uğratmaz (salt okunur dönüşüm).
 */
export function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactObject);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactObject(nested);
    }
    return out;
  }
  return value;
}

export { REDACTED };
