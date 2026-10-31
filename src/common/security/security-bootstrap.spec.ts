import { assertSecurityPostureAtStartup } from './security-bootstrap';

const postureAccess = 'posture-spec-access-secret-min-32-chars-aa';
const postureRefresh = 'posture-spec-refresh-secret-min-32-chars-bb';
const auditKey = 'posture-spec-audit-hmac-key-min-32-chars-ccc';
const pseudonymKey = 'posture-spec-pseudonym-key-min-32-chars-ddd';
const contactKey = 'posture-spec-contact-key-32bytes';
const retiredAuditKey = 'posture-spec-retired-audit-key-32-chars-ee';

const productionEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  ({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: postureAccess,
    JWT_REFRESH_SECRET: postureRefresh,
    JWT_KEY_ID: 'key-3',
    JWT_ISSUER: 'okul-yonetim-saas',
    JWT_ACCESS_AUDIENCE: 'okul-yonetim-saas-api',
    JWT_REFRESH_AUDIENCE: 'okul-yonetim-saas-refresh',
    AUDIT_HMAC_KEY: auditKey,
    AUDIT_HMAC_KEY_ID: 'key-2026-10',
    KVKK_PSEUDONYM_KEY: pseudonymKey,
    KVKK_PSEUDONYM_KEY_VERSION: 'p2',
    ...overrides,
  }) as NodeJS.ProcessEnv;

/**
 * #259 P1B-02 AC-1 — "Production startup fails closed when access/refresh
 * secrets or key identifiers are missing/weak". Doğrulama Nest uygulaması
 * oluşturulmadan önce tek noktada çalışır ve tüm ihlalleri birlikte raporlar.
 */
describe('security posture bootstrap (#259 AC-1)', () => {
  it('accepts a complete production posture and reports identifiers only', () => {
    const report = assertSecurityPostureAtStartup(productionEnv());

    expect(report.profile).toBe('production');
    expect(report.jwt.keyId).toBe('key-3');
    expect(report.jwt.accessSecretChars).toBe(postureAccess.length);
    expect(report.jwt.refreshSecretChars).toBe(postureRefresh.length);
    expect(report.audit.keyId).toBe('key-2026-10');
    expect(report.kvkk.pseudonymKeyVersion).toBe('p2');
    expect(report.localFallbacks).toEqual([]);
  });

  it('never puts secret material into the report', () => {
    const serialized = JSON.stringify(assertSecurityPostureAtStartup(productionEnv()));
    for (const secret of [postureAccess, postureRefresh, auditKey, pseudonymKey, retiredAuditKey]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('lists the rotation key ring without leaking the retired key', () => {
    const report = assertSecurityPostureAtStartup(
      productionEnv({
        AUDIT_HMAC_PREVIOUS_KEYS: JSON.stringify({ 'key-2026-09': retiredAuditKey }),
      }),
    );

    expect(report.audit.retiredKeyIds).toEqual(['key-2026-09']);
    expect(JSON.stringify(report)).not.toContain(retiredAuditKey);
  });

  it('fails closed when NODE_ENV is unset', () => {
    expect(() =>
      assertSecurityPostureAtStartup({
        JWT_ACCESS_SECRET: postureAccess,
        JWT_REFRESH_SECRET: postureRefresh,
      } as NodeJS.ProcessEnv),
    ).toThrow(/NODE_ENV must be explicitly set/);
  });

  it('aggregates every violation into one fail-closed error', () => {
    let message = '';
    try {
      assertSecurityPostureAtStartup({
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: 'short',
        JWT_KEY_ID: undefined,
        AUDIT_HMAC_KEY: auditKey,
        KVKK_PSEUDONYM_KEY: pseudonymKey,
      } as NodeJS.ProcessEnv);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/security posture validation failed/);
    expect(message).toMatch(/JWT_ACCESS_SECRET is required/);
    expect(message).toMatch(/JWT_REFRESH_SECRET is too weak/);
    expect(message).toMatch(/AUDIT_HMAC_KEY_ID is required in production/);
    // Hiçbir gizli değer hata mesajına yazılmaz.
    expect(message).not.toContain(auditKey);
    expect(message).not.toContain(pseudonymKey);
  });

  it('rejects a malformed retired audit key ring at startup', () => {
    expect(() =>
      assertSecurityPostureAtStartup(
        productionEnv({ AUDIT_HMAC_PREVIOUS_KEYS: 'not-json' }),
      ),
    ).toThrow(/AUDIT_HMAC_PREVIOUS_KEYS must be a JSON object/);
  });

  it('treats a missing parent-contact key as an operational warning, not silent success', () => {
    const report = assertSecurityPostureAtStartup(productionEnv());

    expect(report.kvkk.contactKeyId).toBeNull();
    expect(report.warnings.join(' ')).toMatch(/KVKK_CONTACT_KEY is not configured/);
  });

  it('validates the parent-contact key ring shape when it is configured', () => {
    const report = assertSecurityPostureAtStartup(
      productionEnv({ KVKK_CONTACT_KEY: contactKey, KVKK_CONTACT_KEY_ID: 'contact-p2' }),
    );
    expect(report.kvkk.contactKeyId).toBe('contact-p2');

    expect(() =>
      assertSecurityPostureAtStartup(
        productionEnv({ KVKK_CONTACT_KEY: 'too-short', KVKK_CONTACT_KEY_ID: 'contact-p2' }),
      ),
    ).toThrow(/must be exactly 32 bytes/);
  });

  it('reports local fallbacks explicitly in an explicit local profile', () => {
    const report = assertSecurityPostureAtStartup({
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: postureAccess,
      JWT_REFRESH_SECRET: postureRefresh,
    } as NodeJS.ProcessEnv);

    expect(report.profile).toBe('local');
    expect(report.localFallbacks).toEqual(['AUDIT_HMAC_KEY', 'KVKK_PSEUDONYM_KEY']);
    expect(report.audit.usingLocalFallback).toBe(true);
    expect(report.kvkk.usingLocalFallback).toBe(true);
  });
});
