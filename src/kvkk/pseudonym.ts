import { createHmac } from 'crypto';

/**
 * KVKK pseudonymization (P1B · A3 redaction).
 *
 * Ham kimlik (öğrenci/oturum/veli UUID'si) log, audit metadata, outbox payload
 * veya API yanıtına YAZILMAZ. Onun yerine kiracıya kilitli deterministik
 * pseudonym üretilir:
 *
 *   pseudonym = "<keyVersion>:<scope>:<HMAC_SHA256(key, tenantId|scope|rawId)[0..32]>"
 *
 * Özellikler:
 * - **Deterministik**: aynı kiracı + kapsam + özne → aynı değer; olaylar/kuyruk
 *   satırları anahtarı olmadan ham kimliğe çevrilemez ama korele edilebilir.
 * - **Kiracı kilitli**: `tenantId` HMAC girdisinde olduğu için aynı özne iki
 *   kiracıda farklı değer üretir → kiracılar arası eşleştirme (linkability) yok.
 * - **Kapsam ayrık**: aynı UUID farklı kapsamda farklı pseudonym üretir
 *   (öğrenci ↔ oturum çapraz eşleştirmesi engellenir).
 * - **Geri döndürülemez**: anahtar (env) olmadan ham kimliğe çevrilemez.
 *
 * Anahtar yönetimi `resolveAuditHmacKey` ile aynı fail-closed sözleşmeyi izler:
 * production'da eksik/zayıf anahtar süreç hata verir; local/test'te izole
 * anahtar kullanılır. `keyVersion` rotasyonda görünürlük sağlar: anahtar
 * değiştiğinde üretilen yeni pseudonym'ler yeni sürümle etiketlenir.
 */

export const PSEUDONYM_KEY_ENV = 'KVKK_PSEUDONYM_KEY';
export const PSEUDONYM_KEY_VERSION_ENV = 'KVKK_PSEUDONYM_KEY_VERSION';

/** Üretimde pseudonym anahtarı en az 256-bit olmalı (fail-closed). */
export const MIN_PSEUDONYM_KEY_BYTES = 32;

/**
 * Local/test izolasyonu: üretimde FİZİKSEL OLARAK kullanılamaz çünkü
 * `resolvePseudonymKey` production'da env yoksa hata fırlatır.
 */
export const TEST_PSEUDONYM_KEY = 'local-test-kvkk-pseudonym-key-min-32-bytes';

export const LOCAL_PSEUDONYM_KEY_VERSION = 'local-test';
export const DEFAULT_PSEUDONYM_KEY_VERSION = 'p1';

/** Pseudonym çıktısının sürüm etiketi `/^[a-z0-9._-]{1,16}$/` olmalıdır. */
const KEY_VERSION_PATTERN = /^[a-z0-9._-]{1,16}$/;

/** Pseudonym kapsamı: aynı UUID farklı kapsamda farklı değer üretir. */
export type PseudonymScope = 'student' | 'session' | 'guardian';

export type PseudonymKey = Readonly<{ key: string; keyVersion: string }>;

export type PseudonymInput = Readonly<{
  /** Aktif kiracı: pseudonym kiracıya kilitlenir (tenant izolasyonu). */
  tenantId: string;
  scope: PseudonymScope;
  /** Ham kimlik; çıktıya ASLA yazılmaz. */
  rawId: string;
}>;

/**
 * Pseudonym anahtarını fail-closed çözer.
 *
 * - Env varsa: uzunluk doğrulanır (`>= 32`); sürüm etiketi env'den ya da `p1`.
 * - Env yoksa: production'da FATAL (süreç boot etmez); local/test'te izole anahtar.
 */
export function resolvePseudonymKey(
  env: NodeJS.ProcessEnv = process.env,
): PseudonymKey {
  const configured = env[PSEUDONYM_KEY_ENV];
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  const version = (env[PSEUDONYM_KEY_VERSION_ENV] ?? DEFAULT_PSEUDONYM_KEY_VERSION).trim();

  if (configured) {
    if (configured.length < MIN_PSEUDONYM_KEY_BYTES) {
      throw new Error(
        `FATAL: ${PSEUDONYM_KEY_ENV} is too weak (${configured.length} chars, need >= ${MIN_PSEUDONYM_KEY_BYTES}).`,
      );
    }
    if (!KEY_VERSION_PATTERN.test(version)) {
      throw new Error(
        `FATAL: ${PSEUDONYM_KEY_VERSION_ENV} must match ^[a-z0-9._-]{1,16}$.`,
      );
    }
    return { key: configured, keyVersion: version };
  }

  if (isProduction) {
    throw new Error(
      `FATAL: ${PSEUDONYM_KEY_ENV} is required in production but missing from environment.`,
    );
  }

  return { key: TEST_PSEUDONYM_KEY, keyVersion: LOCAL_PSEUDONYM_KEY_VERSION };
}

/**
 * Kiracıya kilitli deterministik pseudonym üretir.
 *
 * Fail-closed girdi kontrolü: boş `tenantId`/`rawId` kabul edilmez (aksi hâlde
 * farklı özneler aynı pseudonym'e düşer ve korelasyon bozulur).
 */
export function pseudonymize(
  input: PseudonymInput,
  key: PseudonymKey = resolvePseudonymKey(),
): string {
  if (input.tenantId.trim() === '') {
    throw new TypeError('pseudonymize: tenantId is required (tenant-scoped pseudonym)');
  }
  if (input.rawId.trim() === '') {
    throw new TypeError('pseudonymize: rawId is required');
  }

  const digest = createHmac('sha256', key.key)
    .update(`${input.tenantId}|${input.scope}|${input.rawId}`, 'utf8')
    .digest('hex')
    .slice(0, 32);

  return `${key.keyVersion}:${input.scope}:${digest}`;
}
