import {
  DEFAULT_PSEUDONYM_KEY_VERSION,
  LOCAL_PSEUDONYM_KEY_VERSION,
  MIN_PSEUDONYM_KEY_BYTES,
  PSEUDONYM_KEY_ENV,
  PSEUDONYM_KEY_VERSION_ENV,
  TEST_PSEUDONYM_KEY,
  pseudonymize,
  resolvePseudonymKey,
} from './pseudonym';

/**
 * KVKK pseudonymization (A3 redaction): ham kimlik yerine deterministik,
 * kiracıya kilitli ve geri döndürülemez referans.
 */
describe('KVKK pseudonymization (A3 redaction)', () => {
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '99999999-9999-4999-8999-999999999999';
  const STUDENT = '44444444-4444-4444-8444-444444444444';
  const SESSION = '22222222-2222-4222-8222-222222222222';

  it('is deterministic for the same tenant, scope and subject', () => {
    const first = pseudonymize({ tenantId: TENANT_A, scope: 'student', rawId: STUDENT });
    const second = pseudonymize({ tenantId: TENANT_A, scope: 'student', rawId: STUDENT });
    expect(first).toBe(second);
  });

  it('never embeds the raw identifier (only a keyed digest)', () => {
    const ref = pseudonymize({ tenantId: TENANT_A, scope: 'student', rawId: STUDENT });
    expect(ref).not.toContain(STUDENT);
    expect(ref).not.toContain(STUDENT.replace(/-/g, ''));
    expect(ref.startsWith(`${LOCAL_PSEUDONYM_KEY_VERSION}:student:`)).toBe(true);
    expect(ref).toMatch(/^local-test:student:[0-9a-f]{32}$/);
  });

  it('separates tenants so the same subject cannot be linked across tenants', () => {
    const inA = pseudonymize({ tenantId: TENANT_A, scope: 'student', rawId: STUDENT });
    const inB = pseudonymize({ tenantId: TENANT_B, scope: 'student', rawId: STUDENT });
    expect(inA).not.toBe(inB);
  });

  it('separates scopes so one raw id cannot be cross-linked between domains', () => {
    const asStudent = pseudonymize({ tenantId: TENANT_A, scope: 'student', rawId: STUDENT });
    const asSession = pseudonymize({ tenantId: TENANT_A, scope: 'session', rawId: STUDENT });
    expect(asStudent).not.toBe(asSession);
  });

  it('fails closed on empty tenant or raw id', () => {
    expect(() =>
      pseudonymize({ tenantId: '   ', scope: 'student', rawId: STUDENT }),
    ).toThrow(/tenantId is required/);
    expect(() =>
      pseudonymize({ tenantId: TENANT_A, scope: 'session', rawId: '' }),
    ).toThrow(/rawId is required/);
  });

  it('uses the isolated test key outside production', () => {
    expect(resolvePseudonymKey({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toEqual({
      key: TEST_PSEUDONYM_KEY,
      keyVersion: LOCAL_PSEUDONYM_KEY_VERSION,
    });
  });

  it('uses the configured key and version label in production', () => {
    const key = resolvePseudonymKey({
      NODE_ENV: 'production',
      [PSEUDONYM_KEY_ENV]: 'x'.repeat(MIN_PSEUDONYM_KEY_BYTES),
      [PSEUDONYM_KEY_VERSION_ENV]: 'p2',
    } as NodeJS.ProcessEnv);
    expect(key).toEqual({ key: 'x'.repeat(MIN_PSEUDONYM_KEY_BYTES), keyVersion: 'p2' });
  });

  it('defaults the version label when it is not configured', () => {
    const key = resolvePseudonymKey({
      NODE_ENV: 'production',
      [PSEUDONYM_KEY_ENV]: 'y'.repeat(MIN_PSEUDONYM_KEY_BYTES),
    } as NodeJS.ProcessEnv);
    expect(key.keyVersion).toBe(DEFAULT_PSEUDONYM_KEY_VERSION);
  });

  it('fails closed in production when the key is missing', () => {
    expect(() => resolvePseudonymKey({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /KVKK_PSEUDONYM_KEY is required in production/,
    );
  });

  it('fails closed when the configured key is too weak', () => {
    expect(() =>
      resolvePseudonymKey({
        NODE_ENV: 'production',
        [PSEUDONYM_KEY_ENV]: 'too-short',
      } as NodeJS.ProcessEnv),
    ).toThrow(/too weak/);
  });

  it('fails closed on an invalid version label', () => {
    expect(() =>
      resolvePseudonymKey({
        NODE_ENV: 'production',
        [PSEUDONYM_KEY_ENV]: 'z'.repeat(MIN_PSEUDONYM_KEY_BYTES),
        [PSEUDONYM_KEY_VERSION_ENV]: 'P2 SÜRÜM',
      } as NodeJS.ProcessEnv),
    ).toThrow(/must match/);
  });
});
