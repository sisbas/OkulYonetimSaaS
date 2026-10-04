import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * #266 N1a — Purpose-bound authenticated-encryption adapter for parent
 * contact values (KVKK encrypted domain storage).
 *
 * Sözleşme (fail-closed):
 * - AES-256-GCM (vetted Node crypto primitive), her encryption'da fresh
 *   12-byte nonce/IV.
 * - Envelope: `{ v, keyId, nonce, ciphertext, tag }` — ciphertext,
 *   auth tag ve key-id ayrı tutulur; ham değer hiçbir zaman disk/log/
 *   payload/audit'te yazılmaz.
 * - **AAD binding**: `tenantId|recordId|purpose` GCM AAD'sine bağlanır;
 *   ciphertext başka kiracı/kayıt amaçlamasına taşınırsa auth tag
 *   doğrulanamaz ve decrypt fail-closed olur (cross-tenant relocation
 *   geçersiz).
 * - Key ring: **current** + **retained previous** anahtar. Rotasyonda
 *   eski ciphertext'ler previous key ile çözülebilir; yeni encryption
 *   her zaman current key ile yapılır.
 * - Unknown key-id, weak/malformed ring, wrong tag veya modified
 *   ciphertext ASLA plaintext'e düşmez — hata fırlatır.
 *
 * Anahtar ayrılığı: bu contact anahtarı, JWT signing, audit HMAC ve
 * pseudonym anahtarıyla AYRI env değişkenlerinden gelir. Pseudonym
 * (geri döndürülemez) encryption yerine kullanılmaz; blind index
 * (gerekirse) purpose-bound türetilmiş keyed HMAC'tir, plain SHA
 * değildir.
 *
 * Production'da `KVKK_CONTACT_KEY` eksikse süreç BAŞLANGIÇTA/ilk
 * işlemde fail-closed durur; local/test izole anahtarı production'da
 * asla döndürülmez. Key oluşturma/rotation bu modülün yetkisi
 * DEĞİLDİR (deployment/secret-manager sınırı).
 */

export const CONTACT_KEY_ENV = 'KVKK_CONTACT_KEY';
export const CONTACT_KEY_ID_ENV = 'KVKK_CONTACT_KEY_ID';
export const CONTACT_PREVIOUS_KEY_ENV = 'KVKK_CONTACT_PREVIOUS_KEY';
export const CONTACT_PREVIOUS_KEY_ID_ENV = 'KVKK_CONTACT_PREVIOUS_KEY_ID';

/** AES-256 için sabit 256-bit (32 byte) anahtar uzunluğu. */
export const CONTACT_KEY_BYTES = 32;

/** Local/test izolasyonu: üretimde FİZİKSEL OLARAK kullanılamaz çünkü
 *  `resolveContactKeyRing` production'da env yoksa hata fırlatır. */
export const TEST_CONTACT_KEY = 'local-test-contact-key-32bytes!!';
export const LOCAL_CONTACT_KEY_ID = 'local-test';
export const DEFAULT_CONTACT_KEY_ID = 'contact-p1';

/** Key-id etiketi: `/^[a-z0-9._-]{1,32}$/` olmalı. */
const KEY_ID_PATTERN = /^[a-z0-9._-]{1,32}$/;

/** Envelope sözleşmesi sürümü. */
export const CONTACT_ENVELOPE_VERSION = 1;

export type ContactCryptoKey = Readonly<{
  keyId: string;
  /** 32-byte AES-256 anahtar materyali (aslında asla loglanmaz). */
  key: Buffer;
}>;

export type ContactKeyRing = Readonly<{
  current: ContactCryptoKey;
  /** Rotasyon sırasında eski ciphertext'leri çözmek için tutulur. */
  previous: ContactCryptoKey | null;
}>;

export type EncryptedContactEnvelope = Readonly<{
  v: number;
  keyId: string;
  /** base64 12-byte nonce/IV. */
  nonce: string;
  /** base64 GCM ciphertext. */
  ciphertext: string;
  /** base64 GCM authentication tag. */
  tag: string;
}>;

export type EncryptContactInput = Readonly<{
  /** Ham contact değer (telefon/eposta); çıktıya ASLA yazılmaz. */
  plaintext: string;
  tenantId: string;
  /** Encrypted kayıt kimliği (contact_point id) — AAD binding. */
  recordId: string;
  /** Purpose domain (ör. 'parent_contact.sms') — AAD binding. */
  purpose: string;
  keyRing?: ContactKeyRing;
}>;

export type DecryptContactInput = Readonly<{
  envelope: EncryptedContactEnvelope;
  tenantId: string;
  recordId: string;
  purpose: string;
  keyRing?: ContactKeyRing;
}>;

export type ContactBlindIndexInput = Readonly<{
  /** Normalize edilmiş (ama ham) contact değer; index'te saklanmaz. */
  normalizedValue: string;
  tenantId: string;
  purpose: string;
  keyRing?: ContactKeyRing;
}>;

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

function parseKey(
  raw: string,
  keyId: string,
  envName: string,
): ContactCryptoKey {
  if (raw.length !== CONTACT_KEY_BYTES) {
    throw new Error(
      `FATAL: ${envName} must be exactly ${CONTACT_KEY_BYTES} bytes (got ${raw.length}).`,
    );
  }
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      `FATAL: ${envName.replace('_KEY', '_KEY_ID')} must match ${KEY_ID_PATTERN.source}.`,
    );
  }
  return { keyId, key: Buffer.from(raw, 'utf8') };
}

/**
 * Contact key ring'ini fail-closed çözer.
 *
 * - Env varsa: current (+ optional previous) anahtar doğrulanır.
 * - Env yoksa: production'da FATAL; local/test'te izole anahtar.
 * - previous key varsa previous key-id de olmalı; yoksa ring geçersiz.
 */
export function resolveContactKeyRing(
  env: NodeJS.ProcessEnv = process.env,
): ContactKeyRing {
  const currentRaw = env[CONTACT_KEY_ENV];
  const currentKeyId = (env[CONTACT_KEY_ID_ENV] ?? DEFAULT_CONTACT_KEY_ID).trim();

  if (currentRaw) {
    const current = parseKey(currentRaw, currentKeyId, CONTACT_KEY_ENV);
    const previousRaw = env[CONTACT_PREVIOUS_KEY_ENV];
    const previousKeyId = (env[CONTACT_PREVIOUS_KEY_ID_ENV] ?? '').trim();
    let previous: ContactCryptoKey | null = null;
    if (previousRaw) {
      if (!previousKeyId) {
        throw new Error(
          `FATAL: ${CONTACT_PREVIOUS_KEY_ID_ENV} is required when ${CONTACT_PREVIOUS_KEY_ENV} is set.`,
        );
      }
      previous = parseKey(previousRaw, previousKeyId, CONTACT_PREVIOUS_KEY_ENV);
    }
    return { current, previous };
  }

  if (isProduction(env)) {
    throw new Error(
      `FATAL: ${CONTACT_KEY_ENV} is required in production but missing from environment.`,
    );
  }

  // Local/test izolasyonu: production'da asla ulaşılamaz (yukarıda FATAL).
  return { current: { keyId: LOCAL_CONTACT_KEY_ID, key: Buffer.from(TEST_CONTACT_KEY, 'utf8') }, previous: null };
}

/** GCM AAD: kiracı + kayıt + purpose bağlamı ciphertext'e kilitle. */
function buildAad(input: { tenantId: string; recordId: string; purpose: string }): Buffer {
  if (input.tenantId.trim() === '' || input.recordId.trim() === '' || input.purpose.trim() === '') {
    throw new TypeError('contact crypto: tenantId, recordId and purpose are required (AAD binding)');
  }
  return Buffer.from(`${input.tenantId}|${input.recordId}|${input.purpose}`, 'utf8');
}

/**
 * Ham contact değerini AES-256-GCM ile encrypted envelope'a dönüştürür.
 * Her çağrıda fresh nonce üretilir; current key kullanılır.
 */
export function encryptContactValue(input: EncryptContactInput): EncryptedContactEnvelope {
  const ring = input.keyRing ?? resolveContactKeyRing();
  const aad = buildAad(input);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.current.key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(input.plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    v: CONTACT_ENVELOPE_VERSION,
    keyId: ring.current.keyId,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decodeBase64(value: string, field: string): Buffer {
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length === 0) {
    throw new Error(`contact crypto: malformed envelope (${field} is empty)`);
  }
  return buffer;
}

function selectKey(
  keyId: string,
  ring: ContactKeyRing,
): ContactCryptoKey {
  if (keyId === ring.current.keyId) return ring.current;
  if (ring.previous && keyId === ring.previous.keyId) return ring.previous;
  throw new Error(`contact crypto: unknown key id '${keyId}' (fail-closed)`);
}

/**
 * Encrypted envelope'ı çözer. AAD (tenant/record/purpose) eşleşmezse
 * veya tag/ciphertext değiştiyse auth doğrulaması başarısız olur ve
 * hata fırlatılır (plaintext'e düşülmez).
 */
export function decryptContactValue(input: DecryptContactInput): string {
  const ring = input.keyRing ?? resolveContactKeyRing();
  const envelope = input.envelope;
  if (envelope.v !== CONTACT_ENVELOPE_VERSION) {
    throw new Error(`contact crypto: unsupported envelope version ${envelope.v}`);
  }
  const key = selectKey(envelope.keyId, ring);
  const aad = buildAad(input);
  const nonce = decodeBase64(envelope.nonce, 'nonce');
  const ciphertext = decodeBase64(envelope.ciphertext, 'ciphertext');
  const tag = decodeBase64(envelope.tag, 'tag');

  const decipher = createDecipheriv('aes-256-gcm', key.key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/**
 * Purpose-bound blind index (dedupe/lookup için).
 *
 * plain SHA(contact) gibi düşük-entropy geri tahmin edilebilir fingerprint
 * DEĞİLDİR: index anahtarı, contact encryption anahtarından
 * `HMAC(contactKey, 'contact:blind-index:v1')` ile türetilir (purpose-
 * separated keyed derivation) ve kiracı+purpose+değer HMAC'lenir.
 * Sonuç deterministiktir ama anahtar olmadan geri çevrilemez.
 */
export function contactBlindIndex(input: ContactBlindIndexInput): string {
  const ring = input.keyRing ?? resolveContactKeyRing();
  if (input.normalizedValue.trim() === '' || input.tenantId.trim() === '' || input.purpose.trim() === '') {
    throw new TypeError('contactBlindIndex: normalizedValue, tenantId and purpose are required');
  }
  const indexKey = createHmac('sha256', ring.current.key)
    .update('contact:blind-index:v1', 'utf8')
    .digest();
  const digest = createHmac('sha256', indexKey)
    .update(`${input.tenantId}|${input.purpose}|${input.normalizedValue}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `${ring.current.keyId}:${digest}`;
}

/**
 * İki base64 dizisinin sabit-zamanlı eşitliğini karşılaştırır
 * (timing-safe). Envelope bütinlik kıyaslamalarında yardımcıdır.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
