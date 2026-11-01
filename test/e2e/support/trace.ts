import * as fs from 'node:fs';

/**
 * S5-B2 (#269 AC-6) — trace artefaktının PII/secret redaksiyonu.
 *
 * Chrome trace dosyası ağ istek başlıklarını, yanıt gövdelerini ve DOM metnini
 * olay argümanları içinde taşıyabilir. Ham trace yüklenirse access token,
 * `Authorization: Bearer ...` başlığı veya sentetik olmayan e-posta sızabilir.
 * Bu yüzden trace durdurulduktan hemen sonra dosya okunur, bilinen desenler
 * maskelenir ve yalnız maskelenmiş kopya artefakt dizininde kalır.
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

function redactJsonValue(value: unknown): unknown {
  if (typeof value === 'string') return redactTraceText(value);
  if (Array.isArray(value)) return value.map(redactJsonValue);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactJsonValue(entry);
    }
    return result;
  }
  return value;
}

/**
 * JSON parse edilemeyen (ör. yarım kalmış) trace'lerde yalnız string
 * literal'leri maskeler; sayısal alanlara (ör. `"ts":5321234567`) dokunmaz.
 */
function redactJsonStringLiterals(text: string): string {
  return text.replace(/"(?:[^"\\\r\n]|\\.)*"/g, (literal) => {
    try {
      return JSON.stringify(redactTraceText(JSON.parse(literal) as string));
    } catch {
      return literal;
    }
  });
}

/**
 * Trace dosyasını yerinde maskeler. Chrome trace formatı JSON'dur; önce
 * yapısal olarak parse edilip yalnız string değerler maskelenir, böylece
 * telefon desenine benzeyen sayısal alanlar (ör. `ts`) bozulmaz. Parse
 * başarısız olursa yalnız string literal'ler üzerinden redaksiyon uygulanır.
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
  let sanitized: string;
  try {
    sanitized = JSON.stringify(redactJsonValue(JSON.parse(raw)));
  } catch {
    findings.push('trace-unparsed-fallback');
    sanitized = redactJsonStringLiterals(raw);
  }
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
