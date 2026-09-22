import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Durable, tamper-evident audit zinciri (#259 P1B-02).
 *
 * Her audit kaydı bir öncekinin `entry_hash`'ini (`prev_hash`) içerir; böylece
 * bir satırın sonradan değiştirilmesi ya da silinmesi zinciri kırar ve
 * `verifyAuditChain` bunu tespit eder. Ayrıca her özet HMAC-SHA256 ile
 * imzalanır; imza anahtarı rotasyonu `signature_key_id` ile izlenir.
 *
 * KVKK: bu modül yalnızca allowlist'ten geçmiş metadata ile çalışır; imza
 * girdisi serbest metin içermez (bkz. audit-metadata-policy.ts).
 */

/** Zincirin ilk kaydı için sabit başlangıç özeti (64 hex). */
export const AUDIT_CHAIN_GENESIS_HASH = '0'.repeat(64);

export const AUDIT_HMAC_KEY_ENV = 'AUDIT_HMAC_KEY';
export const AUDIT_HMAC_KEY_ID_ENV = 'AUDIT_HMAC_KEY_ID';

/** Üretimde HMAC anahtarı en az 256-bit olmalı (fail-closed, #259 AC-2). */
export const MIN_AUDIT_HMAC_KEY_BYTES = 32;

/**
 * Local/test izolasyonu: üretimde FİZİKSEL OLARAK kullanılamaz çünkü
 * `resolveAuditHmacKey` production'da env yoksa hata fırlatır.
 */
export const TEST_AUDIT_HMAC_KEY = 'local-test-audit-hmac-key-min-32-bytes';

/** Zinciri uzatırken serileştirme için transaction-scoped advisory lock anahtarı. */
export const AUDIT_CHAIN_LOCK_KEY = 8412374650021;

export type AuditChainPayload = Readonly<{
  tenantId: string | null;
  actorUserId: string | null;
  actorSessionId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  requestId: string;
  metadataJson: unknown;
  /** ISO-8601 UTC; DB'ye yazılan `created_at` ile birebir aynı değer olmalı. */
  createdAt: string;
}>;

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(
      entries.map(([key, nested]) => [key, sortKeysDeep(nested)]),
    );
  }
  return value;
}

/** Anahtar sırasından bağımsız, deterministik JSON gövdesi. */
export function canonicalAuditPayload(payload: AuditChainPayload): string {
  return JSON.stringify(
    sortKeysDeep({
      tenantId: payload.tenantId,
      actorUserId: payload.actorUserId,
      actorSessionId: payload.actorSessionId,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      requestId: payload.requestId,
      metadataJson: payload.metadataJson ?? null,
      createdAt: payload.createdAt,
    }),
  );
}

/** `entry_hash = sha256(prev_hash + '\n' + canonical payload)`. */
export function computeAuditEntryHash(
  prevHash: string,
  payload: AuditChainPayload,
): string {
  return createHash('sha256')
    .update(`${prevHash}\n${canonicalAuditPayload(payload)}`, 'utf8')
    .digest('hex');
}

export type AuditHmacKey = Readonly<{ key: string; keyId: string }>;

/**
 * HMAC anahtarını fail-closed çözer.
 *
 * - Env varsa: uzunluk doğrulanır (`>= 32`); `keyId` env'den ya da `key-1`'den.
 * - Env yoksa: production'da FATAL (süreç boot etmez); local/test'te izole anahtar.
 *
 * `keyId` rotasyon sözleşmesidir: eski anahtarla imzalanmış kayıtlar kendi
 * `signature_key_id`'siyle doğrulanır (bkz. `.env.example`).
 */
export function resolveAuditHmacKey(
  env: NodeJS.ProcessEnv = process.env,
): AuditHmacKey {
  const configured = env[AUDIT_HMAC_KEY_ENV];
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  if (configured) {
    if (configured.length < MIN_AUDIT_HMAC_KEY_BYTES) {
      throw new Error(
        `FATAL: ${AUDIT_HMAC_KEY_ENV} is too weak (${configured.length} chars, need >= ${MIN_AUDIT_HMAC_KEY_BYTES}).`,
      );
    }
    return { key: configured, keyId: env[AUDIT_HMAC_KEY_ID_ENV] ?? 'key-1' };
  }

  if (isProduction) {
    throw new Error(
      `FATAL: ${AUDIT_HMAC_KEY_ENV} is required in production but missing from environment.`,
    );
  }

  return { key: TEST_AUDIT_HMAC_KEY, keyId: 'local-test-key' };
}

/** `entry_hash` üzerinden HMAC-SHA256 imzası (hex). */
export function signAuditEntryHash(entryHash: string, hmacKey: string): string {
  return createHmac('sha256', hmacKey).update(entryHash, 'utf8').digest('hex');
}

export type AuditChainRecordForVerification = Readonly<{
  sequence: number;
  prevHash: string | null;
  entryHash: string | null;
  signature: string | null;
  signatureKeyId: string | null;
  payload: AuditChainPayload;
}>;

export type AuditChainVerification = Readonly<{
  valid: boolean;
  brokenAtSequence: number | null;
  reason:
    | 'unchained-entry'
    | 'prev-hash-mismatch'
    | 'entry-hash-mismatch'
    | 'missing-signature'
    | 'signature-mismatch'
    | null;
}>;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Zinciri baştan sona doğrular (`sequence` artan sırada).
 *
 * @param hmacKey verilirse imzalar da doğrulanır (zorunlu hâle gelir).
 */
export function verifyAuditChain(
  records: readonly AuditChainRecordForVerification[],
  hmacKey?: string,
): AuditChainVerification {
  let expectedPrev = AUDIT_CHAIN_GENESIS_HASH;

  for (const record of records) {
    if (!record.entryHash || !record.prevHash) {
      return {
        valid: false,
        brokenAtSequence: record.sequence,
        reason: 'unchained-entry',
      };
    }
    if (record.prevHash !== expectedPrev) {
      return {
        valid: false,
        brokenAtSequence: record.sequence,
        reason: 'prev-hash-mismatch',
      };
    }
    const recomputed = computeAuditEntryHash(record.prevHash, record.payload);
    if (!constantTimeEquals(recomputed, record.entryHash)) {
      return {
        valid: false,
        brokenAtSequence: record.sequence,
        reason: 'entry-hash-mismatch',
      };
    }
    if (hmacKey !== undefined) {
      if (!record.signature) {
        return {
          valid: false,
          brokenAtSequence: record.sequence,
          reason: 'missing-signature',
        };
      }
      const expectedSignature = signAuditEntryHash(record.entryHash, hmacKey);
      if (!constantTimeEquals(expectedSignature, record.signature)) {
        return {
          valid: false,
          brokenAtSequence: record.sequence,
          reason: 'signature-mismatch',
        };
      }
    }
    expectedPrev = record.entryHash;
  }

  return { valid: true, brokenAtSequence: null, reason: null };
}
