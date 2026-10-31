import * as fs from 'node:fs';

/**
 * S5-B2 (#269 AC-6) �?" trace artefakt�n�n PII/secret redaksiyonu.
 *
 * Chrome trace dosyas� a� istek başl�klar�n�, yan�t gövdelerini ve DOM metnini
 * olay argümanlar� içinde taş�yabilir. Ham trace yüklenirse access token,
 * `Authorization: Bearer ...` başl��� veya sentetik olmayan e-posta s�zabilir.
 * Bu y�zden trace durdurulduktan hemen sonra dosya okunur, bilinen desenler
 * maskelenir ve yaln�z maskelenmiş kopya artefakt dizininde kal�r.
 */

const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g;
const COOKIE_RE = /((?:set-)?cookie["']?\s*[:=]\s*["']?)[^"'\r\n]+/gi;
const SECRET_JSON_RE = /("(?:password|credential|accessToken|refreshToken|authorization)"\s*:\s*")[^"]*(")/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![0-9A-Za-z])(?:\+90|0090|0)?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?![0-9A-Za-z])/g;

export function redactTraceText(value: string): string {
  return String(value ?? '')
    .replace(JWT_RE, '<jwt-redacted>')
    .replace(BEARER_RE, 'Bearer <redacted>')
    .replace(COOKIE_RE, '$1<redacted>')
    .replace(SECRET_JSON_RE, '$1<redacted>$2')
    .replace(EMAIL_RE, (email) => (email.toLowerCase().endsWith('@qa.invalid') ? email : '<email-redacted>'))
    .replace(PHONE_RE, '<phone-redacted>');
}

/**
 * Trace dosyas�n� yerinde maskeler. Chrome trace format� JSON array'dir; metin
 * tabanl� redaksiyon JSON yap�s�n� bozmaz çünkü desenler yaln�z string
 * değerlerin içinde geçer.
 */
export function sanitizeTraceFile(filePath: string): { bytes: number; findings: string[] } {
  if (!fs.existsSync(filePath)) return { bytes: 0, findings: ['trace-missing'] };
  const raw = fs.readFileSync(filePath, 'utf8');
  const findings: string[] = [];
  if (JWT_RE.test(raw)) findings.push('jwt-token');
  if (BEARER_RE.test(raw)) findings.push('authorization-header');
  if (COOKIE_RE.test(raw)) findings.push('cookie');
  JWT_RE.lastIndex = 0;
  BEARER_RE.lastIndex = 0;
  COOKIE_RE.lastIndex = 0;
  let sanitized = redactTraceText(raw);
  const credential = process.env.E2E_SYNTHETIC_CREDENTIAL;
  if (credential !== undefined && credential.length >= 8) {
    if (sanitized.includes(credential)) findings.push('synthetic-credential');
    sanitized = sanitized.split(credential).join('<credential-redacted>');
    const encoded = encodeURIComponent(credential);
    sanitized = sanitized.split(encoded).join('<credential-redacted>');
  }
  fs.writeFileSync(filePath, sanitized, 'utf8');
  return { bytes: Buffer.byteLength(sanitized, 'utf8'), findings };
}
