import { isProductionEnvironment, resolveRuntimeProfile } from '../common/security/environment-profile';

/**
 * JWT anahtar sözleşmesi (#259 P1B-02 AC-1 / AC-3).
 *
 * - Tahmin edilebilir dev fallback YOK: access/refresh secret'ları zorunludur ve
 *   en az 256-bit (32 karakter) olmalıdır. Eksik/zayıf secret süreci boot
 *   ettirmez.
 * - Access ve refresh secret'ları AYNI OLAMAZ: aksi hâlde uzun ömürlü bir
 *   refresh token access token olarak kullanılabilir (yetki yükseltme).
 * - `JWT_KEY_ID` rotasyon sözleşmesidir: imzalanan her token `kid` başlığı
 *   taşır, doğrulama aktif `kid` ile eşleşmeyen token'ı REDDEDER. Böylece
 *   emekliye ayrılmış bir secret ile imzalanmış token sessizce kabul edilmez.
 */

export const JWT_ACCESS_SECRET_ENV = 'JWT_ACCESS_SECRET';
export const JWT_REFRESH_SECRET_ENV = 'JWT_REFRESH_SECRET';
export const JWT_KEY_ID_ENV = 'JWT_KEY_ID';
export const JWT_ISSUER_ENV = 'JWT_ISSUER';
export const JWT_ACCESS_AUDIENCE_ENV = 'JWT_ACCESS_AUDIENCE';
export const JWT_REFRESH_AUDIENCE_ENV = 'JWT_REFRESH_AUDIENCE';

/** Üretimde her JWT secret'ı en az 256-bit olmalı. */
export const MIN_JWT_SECRET_BYTES = 32;

/** Local/test varsayılanı; production'da `JWT_KEY_ID` AÇIKÇA verilmelidir. */
export const DEFAULT_JWT_KEY_ID = 'key-1';
export const LOCAL_JWT_ISSUER = 'okul-yonetim-saas';
export const LOCAL_JWT_ACCESS_AUDIENCE = 'okul-yonetim-saas-api';
export const LOCAL_JWT_REFRESH_AUDIENCE = 'okul-yonetim-saas-refresh';

/** `kid` başlığı ve issuer/audience değerleri için izinli biçim. */
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const CLAIM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,119}$/;

export type JwtSecretKind = 'access' | 'refresh';

export type JwtKey = Readonly<{
  kind: JwtSecretKind;
  /** İmza/doğrulama anahtarı. ASLA loglanmaz. */
  secret: string;
  /** `kid` başlığına yazılan ve doğrulamada zorunlu tutulan anahtar kimliği. */
  keyId: string;
}>;

export type JwtTokenContract = Readonly<{
  issuer: string;
  accessAudience: string;
  refreshAudience: string;
}>;

function envNameFor(kind: JwtSecretKind): string {
  return kind === 'access' ? JWT_ACCESS_SECRET_ENV : JWT_REFRESH_SECRET_ENV;
}

function readSecret(kind: JwtSecretKind, env: NodeJS.ProcessEnv): string {
  const envName = envNameFor(kind);
  const secret = env[envName];
  if (!secret) {
    throw new Error(`FATAL: ${envName} is required but missing from environment.`);
  }
  if (secret.length < MIN_JWT_SECRET_BYTES) {
    throw new Error(
      `FATAL: ${envName} is too weak (${secret.length} chars, need >= ${MIN_JWT_SECRET_BYTES}). ` +
        `Set a strong ${envName} before starting in production.`,
    );
  }
  return secret;
}

/**
 * Anahtar kimliğini (`kid`) fail-closed çözer.
 *
 * Production'da `JWT_KEY_ID` zorunludur (aksi hâlde rotasyon izlenemez); local
 * profilde `key-1` varsayılanı kullanılır. Biçim ihlali her profilde FATAL.
 */
export function resolveJwtKeyId(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env[JWT_KEY_ID_ENV] ?? '').trim();
  if (configured === '') {
    if (isProductionEnvironment(env)) {
      throw new Error(
        `FATAL: ${JWT_KEY_ID_ENV} is required in production but missing from environment ` +
          `(rotation/key-id contract; see docs/security/secret-rotation-and-rollback.md).`,
      );
    }
    return DEFAULT_JWT_KEY_ID;
  }
  if (!KEY_ID_PATTERN.test(configured)) {
    throw new Error(
      `FATAL: ${JWT_KEY_ID_ENV} must match ${KEY_ID_PATTERN.source} (received ${configured.length} chars).`,
    );
  }
  return configured;
}

function readClaim(
  env: NodeJS.ProcessEnv,
  envName: string,
  fallback: string,
  profile: 'production' | 'local',
): string {
  const configured = (env[envName] ?? '').trim();
  if (configured === '') {
    if (profile === 'production') {
      throw new Error(`FATAL: ${envName} is required in production but missing from environment.`);
    }
    return fallback;
  }
  if (!CLAIM_PATTERN.test(configured)) {
    throw new Error(`FATAL: ${envName} must match ${CLAIM_PATTERN.source} (received ${configured.length} chars).`);
  }
  return configured;
}

/**
 * Issuer/audience sözleşmesini çözer.
 *
 * Modül yükleme anında donmuş sabitler yerine her çağrıda env'den okunur;
 * böylece testler ve rotasyon prosedürü ortamı değiştirdiğinde değerler
 * tutarlı kalır.
 */
export function resolveJwtTokenContract(env: NodeJS.ProcessEnv = process.env): JwtTokenContract {
  const profile = resolveRuntimeProfile(env, 'the JWT issuer/audience contract');
  return {
    issuer: readClaim(env, JWT_ISSUER_ENV, LOCAL_JWT_ISSUER, profile),
    accessAudience: readClaim(env, JWT_ACCESS_AUDIENCE_ENV, LOCAL_JWT_ACCESS_AUDIENCE, profile),
    refreshAudience: readClaim(env, JWT_REFRESH_AUDIENCE_ENV, LOCAL_JWT_REFRESH_AUDIENCE, profile),
  };
}

/**
 * Tek bir JWT anahtarını (secret + kid) fail-closed çözer.
 *
 * Access ve refresh secret'larının farklı olması doğrulanır: aynı secret iki
 * amaç için kullanılırsa refresh token access token olarak geçerli olur.
 */
export function resolveJwtKey(kind: JwtSecretKind, env: NodeJS.ProcessEnv = process.env): JwtKey {
  const secret = readSecret(kind, env);
  const other = envNameFor(kind === 'access' ? 'refresh' : 'access');
  if (env[other] && env[other] === secret) {
    throw new Error(
      `FATAL: ${JWT_ACCESS_SECRET_ENV} and ${JWT_REFRESH_SECRET_ENV} must be different values ` +
        `(a shared secret lets a refresh token be replayed as an access token).`,
    );
  }
  return { kind, secret, keyId: resolveJwtKeyId(env) };
}

/** Geriye dönük uyumluluk: yalnız secret döndürür. */
export function loadJwtAccessSecret(env: NodeJS.ProcessEnv = process.env): string {
  return resolveJwtKey('access', env).secret;
}

/** Geriye dönük uyumluluk: yalnız secret döndürür. */
export function loadJwtRefreshSecret(env: NodeJS.ProcessEnv = process.env): string {
  return resolveJwtKey('refresh', env).secret;
}

/**
 * `kid` başlığı doğrulaması: eksik ya da farklı `kid` fail-closed reddedilir.
 * Dönen değer hata mesajına yazılabilecek kısa kimliktir (secret değil).
 */
export function assertTokenKeyId(
  kind: JwtSecretKind,
  tokenKeyId: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const expected = resolveJwtKeyId(env);
  if (tokenKeyId !== expected) {
    const received =
      typeof tokenKeyId === 'string' ? `'${tokenKeyId.slice(0, 40)}'` : '<missing>';
    throw new Error(`JWT ${kind} token key id mismatch: expected '${expected}', received ${received}.`);
  }
  return expected;
}

