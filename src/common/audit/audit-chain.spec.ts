import {
  AUDIT_CHAIN_GENESIS_HASH,
  AuditChainPayload,
  MIN_AUDIT_HMAC_KEY_BYTES,
  TEST_AUDIT_HMAC_KEY,
  canonicalAuditPayload,
  computeAuditEntryHash,
  resolveAuditHmacKey,
  signAuditEntryHash,
  verifyAuditChain,
} from './audit-chain';

/**
 * Durable audit zinciri (#259): hash determinizmi, kurcalama tespiti ve
 * fail-closed HMAC anahtar sözleşmesi.
 */
describe('audit chain (#259)', () => {
  const payload = (overrides: Partial<AuditChainPayload> = {}): AuditChainPayload => ({
    tenantId: '11111111-1111-4111-8111-111111111111',
    actorUserId: '22222222-2222-4222-8222-222222222222',
    actorSessionId: null,
    action: 'attendance.record.marked',
    entityType: 'attendance',
    entityId: '33333333-3333-4333-8333-333333333333',
    requestId: 'req-1',
    metadataJson: { schemaVersion: 1, result: 'success', changedFields: ['status'] },
    createdAt: '2026-09-22T12:00:00.000Z',
    ...overrides,
  });

  const chainOf = (count: number) => {
    const records: Array<Parameters<typeof verifyAuditChain>[0][number]> = [];
    let prevHash = AUDIT_CHAIN_GENESIS_HASH;
    for (let index = 0; index < count; index += 1) {
      const entryPayload = payload({ requestId: `req-${index + 1}` });
      const entryHash = computeAuditEntryHash(prevHash, entryPayload);
      records.push({
        sequence: index + 1,
        prevHash,
        entryHash,
        signature: signAuditEntryHash(entryHash, TEST_AUDIT_HMAC_KEY),
        signatureKeyId: 'local-test-key',
        payload: entryPayload,
      });
      prevHash = entryHash;
    }
    return records;
  };

  it('canonicalizes the payload independently of key order', () => {
    const left = canonicalAuditPayload(payload());
    const right = canonicalAuditPayload({
      ...payload(),
      metadataJson: { changedFields: ['status'], result: 'success', schemaVersion: 1 },
    });
    expect(left).toBe(right);
  });

  it('produces a different hash when any field changes', () => {
    const base = computeAuditEntryHash(AUDIT_CHAIN_GENESIS_HASH, payload());
    const changed = computeAuditEntryHash(
      AUDIT_CHAIN_GENESIS_HASH,
      payload({ action: 'attendance.record.corrected' }),
    );
    expect(changed).not.toBe(base);
  });

  it('verifies a well-formed chain including signatures', () => {
    expect(verifyAuditChain(chainOf(3), TEST_AUDIT_HMAC_KEY)).toEqual({
      valid: true,
      brokenAtSequence: null,
      reason: null,
    });
  });

  it('detects a tampered payload (entry-hash mismatch)', () => {
    const records = chainOf(3);
    const tampered = [
      records[0],
      { ...records[1], payload: payload({ action: 'attendance.session.closed' }) },
      records[2],
    ];
    expect(verifyAuditChain(tampered, TEST_AUDIT_HMAC_KEY)).toMatchObject({
      valid: false,
      brokenAtSequence: 2,
      reason: 'entry-hash-mismatch',
    });
  });

  it('detects a removed row (prev-hash mismatch)', () => {
    const records = chainOf(3);
    expect(verifyAuditChain([records[0], records[2]], TEST_AUDIT_HMAC_KEY)).toMatchObject({
      valid: false,
      brokenAtSequence: 3,
      reason: 'prev-hash-mismatch',
    });
  });

  it('detects legacy rows that are not part of the chain', () => {
    const records = chainOf(1);
    expect(
      verifyAuditChain(
        [{ ...records[0], entryHash: null, prevHash: null }],
        TEST_AUDIT_HMAC_KEY,
      ),
    ).toMatchObject({ valid: false, reason: 'unchained-entry' });
  });

  it('detects a signature produced with a different key', () => {
    const records = chainOf(1);
    const otherKeySignature = signAuditEntryHash(
      records[0].entryHash as string,
      'another-audit-hmac-key-with-32-chars-min',
    );
    expect(
      verifyAuditChain([{ ...records[0], signature: otherKeySignature }], TEST_AUDIT_HMAC_KEY),
    ).toMatchObject({ valid: false, reason: 'signature-mismatch' });
  });

  it('requires signatures when an HMAC key is supplied', () => {
    const records = chainOf(1);
    expect(
      verifyAuditChain([{ ...records[0], signature: null }], TEST_AUDIT_HMAC_KEY),
    ).toMatchObject({ valid: false, reason: 'missing-signature' });
  });
});

describe('audit HMAC key contract (#259)', () => {
  it('uses the configured key and its rotation id', () => {
    const key = resolveAuditHmacKey({
      NODE_ENV: 'production',
      AUDIT_HMAC_KEY: 'x'.repeat(MIN_AUDIT_HMAC_KEY_BYTES),
      AUDIT_HMAC_KEY_ID: 'key-2026-09',
    } as NodeJS.ProcessEnv);
    expect(key).toEqual({ key: 'x'.repeat(MIN_AUDIT_HMAC_KEY_BYTES), keyId: 'key-2026-09' });
  });

  it('fails closed in production when the key is missing', () => {
    expect(() =>
      resolveAuditHmacKey({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/FATAL: AUDIT_HMAC_KEY is required in production/);
  });

  it('fails closed when the configured key is too weak', () => {
    expect(() =>
      resolveAuditHmacKey({
        NODE_ENV: 'production',
        AUDIT_HMAC_KEY: 'too-short',
      } as NodeJS.ProcessEnv),
    ).toThrow(/too weak/);
  });

  it('falls back to the isolated test key outside production only', () => {
    const key = resolveAuditHmacKey({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    expect(key).toEqual({ key: TEST_AUDIT_HMAC_KEY, keyId: 'local-test-key' });
  });
});
