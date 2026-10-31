import { resolveAuditHmacKey, TEST_AUDIT_HMAC_KEY } from '../audit/audit-chain';
import { resolveContactKeyRing, TEST_CONTACT_KEY } from '../../kvkk/contact-crypto';
import { resolvePseudonymKey, TEST_PSEUDONYM_KEY } from '../../kvkk/pseudonym';

const PRODUCTION_JWT_KEY = 'x'.repeat(32);

/**
 * #259 P1B-02 AC-2 — "Local/test fallback is explicit, isolated and impossible
 * in production".
 *
 * Üç bağımsız anahtar ailesi (audit HMAC, KVKK pseudonym, parent-contact) aynı
 * kurala tabidir: fallback yalnız NODE_ENV AÇIKÇA local bir değere ayarlandığında
 * döner. NODE_ENV set edilmemiş bir dağıtımda fallback sessizce devreye
 * giremez.
 */
describe('local fallback isolation (#259 AC-2)', () => {
  describe('audit HMAC key', () => {
    it('refuses the local fallback when NODE_ENV is unset', () => {
      expect(() => resolveAuditHmacKey({} as NodeJS.ProcessEnv)).toThrow(
        /NODE_ENV must be explicitly set/,
      );
    });

    it('returns the isolated test key only in an explicit local profile', () => {
      const key = resolveAuditHmacKey({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
      expect(key.key).toBe(TEST_AUDIT_HMAC_KEY);
      expect(key.keyId).toBe('local-test-key');
    });

    it('never falls back in production', () => {
      expect(() =>
        resolveAuditHmacKey({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
      ).toThrow(/AUDIT_HMAC_KEY is required in production/);
    });

    it('requires an explicit key id in production (rotation traceability)', () => {
      expect(() =>
        resolveAuditHmacKey({
          NODE_ENV: 'production',
          AUDIT_HMAC_KEY: PRODUCTION_JWT_KEY,
        } as NodeJS.ProcessEnv),
      ).toThrow(/AUDIT_HMAC_KEY_ID is required in production/);
    });

    it('rejects a malformed key id in every profile', () => {
      expect(() =>
        resolveAuditHmacKey({
          NODE_ENV: 'production',
          AUDIT_HMAC_KEY: PRODUCTION_JWT_KEY,
          AUDIT_HMAC_KEY_ID: 'bad key id with spaces',
        } as NodeJS.ProcessEnv),
      ).toThrow(/AUDIT_HMAC_KEY_ID must match/);
    });
  });

  describe('KVKK pseudonym key', () => {
    it('refuses the local fallback when NODE_ENV is unset', () => {
      expect(() => resolvePseudonymKey({} as NodeJS.ProcessEnv)).toThrow(
        /NODE_ENV must be explicitly set/,
      );
    });

    it('returns the isolated test key only in an explicit local profile', () => {
      expect(resolvePseudonymKey({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).key).toBe(
        TEST_PSEUDONYM_KEY,
      );
    });

    it('never falls back in production', () => {
      expect(() =>
        resolvePseudonymKey({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
      ).toThrow(/KVKK_PSEUDONYM_KEY is required in production/);
    });
  });

  describe('parent-contact encryption key ring', () => {
    it('refuses the local fallback when NODE_ENV is unset', () => {
      expect(() => resolveContactKeyRing({} as NodeJS.ProcessEnv)).toThrow(
        /NODE_ENV must be explicitly set/,
      );
    });

    it('returns the isolated test key only in an explicit local profile', () => {
      const ring = resolveContactKeyRing({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
      expect(ring.current.key.toString('utf8')).toBe(TEST_CONTACT_KEY);
      expect(ring.current.keyId).toBe('local-test');
    });

    it('never falls back in production', () => {
      expect(() =>
        resolveContactKeyRing({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
      ).toThrow(/KVKK_CONTACT_KEY is required in production/);
    });
  });
});
