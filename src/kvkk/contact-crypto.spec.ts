import {
  CONTACT_KEY_ENV,
  CONTACT_KEY_ID_ENV,
  CONTACT_PREVIOUS_KEY_ENV,
  CONTACT_PREVIOUS_KEY_ID_ENV,
  contactBlindIndex,
  ContactKeyRing,
  decryptContactValue,
  encryptContactValue,
  resolveContactKeyRing,
  TEST_CONTACT_KEY,
} from './contact-crypto';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const RECORD_X = '33333333-3333-4333-8333-333333333333';
const RECORD_Y = '44444444-4444-4444-8444-444444444444';
const PURPOSE = 'parent_contact.point';
const PLAINTEXT = '+905551234567';

function makeRing(
  currentKeyId = 'contact-p1',
  currentBytes = 1,
  previousKeyId?: string,
  previousBytes?: number,
): ContactKeyRing {
  return {
    current: { keyId: currentKeyId, key: Buffer.alloc(32, currentBytes) },
    previous:
      previousKeyId === undefined || previousBytes === undefined
        ? null
        : { keyId: previousKeyId, key: Buffer.alloc(32, previousBytes) },
  };
}

describe('contact crypto adapter (#266 N1a)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('round-trips plaintext through the encrypted envelope', () => {
    const ring = makeRing();
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    const decoded = decryptContactValue({
      envelope,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    expect(decoded).toBe(PLAINTEXT);
    // Envelope taşıyıcı alanlar ham değeri içermez.
    expect(JSON.stringify(envelope)).not.toContain(PLAINTEXT);
  });

  it('uses a fresh nonce per encryption (same plaintext → distinct ciphertext)', () => {
    const ring = makeRing();
    const first = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    const second = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('rejects decryption with the wrong key (fail-closed)', () => {
    const ring = makeRing('contact-p1', 1);
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    const wrongKeyRing = makeRing('contact-p1', 2);
    expect(() =>
      decryptContactValue({
        envelope,
        tenantId: TENANT_A,
        recordId: RECORD_X,
        purpose: PURPOSE,
        keyRing: wrongKeyRing,
      }),
    ).toThrow();
  });

  it('rejects a modified authentication tag (fail-closed)', () => {
    const ring = makeRing();
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    const tampered = {
      ...envelope,
      tag: Buffer.from(
        Buffer.from(envelope.tag, 'base64').fill(0x00),
      ).toString('base64'),
    };
    expect(() =>
      decryptContactValue({
        envelope: tampered,
        tenantId: TENANT_A,
        recordId: RECORD_X,
        purpose: PURPOSE,
        keyRing: ring,
      }),
    ).toThrow();
  });

  it('rejects modified ciphertext (fail-closed)', () => {
    const ring = makeRing();
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    ciphertext[0] = ciphertext[0] ^ 0xff;
    const tampered = {
      ...envelope,
      ciphertext: ciphertext.toString('base64'),
    };
    expect(() =>
      decryptContactValue({
        envelope: tampered,
        tenantId: TENANT_A,
        recordId: RECORD_X,
        purpose: PURPOSE,
        keyRing: ring,
      }),
    ).toThrow();
  });

  it('rejects an unknown key-id (fail-closed, no arbitrary latest selection)', () => {
    const ring = makeRing();
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    const unknownKeyId = { ...envelope, keyId: 'contact-unknown' };
    expect(() =>
      decryptContactValue({
        envelope: unknownKeyId,
        tenantId: TENANT_A,
        recordId: RECORD_X,
        purpose: PURPOSE,
        keyRing: ring,
      }),
    ).toThrow(/unknown key id/);
  });

  it('supports key rotation: previous key decrypts legacy ciphertext, current encrypts new', () => {
    // Legacy ring: current key = contact-p0 (bytes=1).
    const legacyRing = makeRing('contact-p0', 1);
    const legacyEnvelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: legacyRing,
    });
    expect(legacyEnvelope.keyId).toBe('contact-p0');

    // Rotasyon: eski key (contact-p0) now retained as previous;
    // yeni key (contact-p1, bytes=2) current.
    const rotatedRing = makeRing('contact-p1', 2, 'contact-p0', 1);
    // Eski ciphertext previous key ile çözülebilir.
    expect(
      decryptContactValue({
        envelope: legacyEnvelope,
        tenantId: TENANT_A,
        recordId: RECORD_X,
        purpose: PURPOSE,
        keyRing: rotatedRing,
      }),
    ).toBe(PLAINTEXT);

    // Yeni encryption her zaman current key ile yapılır.
    const newEnvelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: rotatedRing,
    });
    expect(newEnvelope.keyId).toBe('contact-p1');
    expect(newEnvelope.keyId).not.toBe(legacyEnvelope.keyId);
  });

  it('denies cross-tenant ciphertext relocation (AAD binding)', () => {
    const ring = makeRing();
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    // Aynı kayıt amaçlaması ama FARKLI kiracı → tag doğrulaması başarısız.
    expect(() =>
      decryptContactValue({
        envelope,
        tenantId: TENANT_B,
        recordId: RECORD_X,
        purpose: PURPOSE,
        keyRing: makeRing(),
      }),
    ).toThrow();
  });

  it('denies cross-record ciphertext relocation (AAD binding)', () => {
    const ring = makeRing();
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    expect(() =>
      decryptContactValue({
        envelope,
        tenantId: TENANT_A,
        recordId: RECORD_Y,
        purpose: PURPOSE,
        keyRing: ring,
      }),
    ).toThrow();
  });

  it('denies wrong-purpose decryption (AAD binding)', () => {
    const ring = makeRing();
    const envelope = encryptContactValue({
      plaintext: PLAINTEXT,
      tenantId: TENANT_A,
      recordId: RECORD_X,
      purpose: PURPOSE,
      keyRing: ring,
    });
    expect(() =>
      decryptContactValue({
        envelope,
        tenantId: TENANT_A,
        recordId: RECORD_X,
        purpose: 'other.purpose',
        keyRing: ring,
      }),
    ).toThrow();
  });

  it('fail-closes in production when the contact key is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env[CONTACT_KEY_ENV];
    expect(() => resolveContactKeyRing()).toThrow(/required in production/);
  });

  it('fail-closes on a weak (<32 byte) key', () => {
    process.env.NODE_ENV = 'production';
    process.env[CONTACT_KEY_ENV] = 'short';
    process.env[CONTACT_KEY_ID_ENV] = 'contact-p1';
    expect(() => resolveContactKeyRing()).toThrow(/must be exactly 32 bytes/);
  });

  it('fail-closes when a previous key is set without a previous key-id', () => {
    process.env.NODE_ENV = 'production';
    process.env[CONTACT_KEY_ENV] = TEST_CONTACT_KEY;
    process.env[CONTACT_KEY_ID_ENV] = 'contact-p1';
    process.env[CONTACT_PREVIOUS_KEY_ENV] = TEST_CONTACT_KEY;
    delete process.env[CONTACT_PREVIOUS_KEY_ID_ENV];
    expect(() => resolveContactKeyRing()).toThrow(
      /CONTACT_PREVIOUS_KEY_ID is required/,
    );
  });

  it('resolves an isolated local/test key only outside production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env[CONTACT_KEY_ENV];
    const ring = resolveContactKeyRing();
    expect(ring.current.keyId).toBe('local-test');
    expect(ring.current.key.length).toBe(32);
  });

  describe('blind index (purpose-bound keyed, not plain SHA)', () => {
    it('is deterministic and tenant/purpose separated', () => {
      const ring = makeRing();
      const index = contactBlindIndex({
        normalizedValue: '+905551234567',
        tenantId: TENANT_A,
        purpose: PURPOSE,
        keyRing: ring,
      });
      const sameAgain = contactBlindIndex({
        normalizedValue: '+905551234567',
        tenantId: TENANT_A,
        purpose: PURPOSE,
        keyRing: ring,
      });
      expect(index).toBe(sameAgain);

      // Farklı kiracı → farklı index (kiracılar arası eşleştirme yok).
      const otherTenant = contactBlindIndex({
        normalizedValue: '+905551234567',
        tenantId: TENANT_B,
        purpose: PURPOSE,
        keyRing: ring,
      });
      expect(otherTenant).not.toBe(index);

      // Farklı purpose → farklı index.
      const otherPurpose = contactBlindIndex({
        normalizedValue: '+905551234567',
        tenantId: TENANT_A,
        purpose: 'other.purpose',
        keyRing: ring,
      });
      expect(otherPurpose).not.toBe(index);

      // Index, ham değerin/plain SHA'sı değildir.
      expect(index).not.toContain('+905551234567');
      expect(index).toMatch(/^contact-p1:[0-9a-f]{32}$/);
    });
  });
});
