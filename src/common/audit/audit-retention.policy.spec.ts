import {
  DEFAULT_AUDIT_RETENTION_DAYS,
  AUDIT_RETENTION_DEFAULT_DAYS_ENV,
  auditRetentionCutoff,
  isAuditRecordRetentionEligible,
  resolveAuditRetentionDays,
} from './audit-retention.policy';

/**
 * Audit retention politikası (#259): varsayılan 7 yıl, aile bazlı override,
 * env ile konfigürasyon ve fail-closed doğrulama.
 */
describe('audit retention policy (#259)', () => {
  const env = {} as NodeJS.ProcessEnv;

  it('defaults to 7 years (2555 days)', () => {
    expect(DEFAULT_AUDIT_RETENTION_DAYS).toBe(2555);
    expect(resolveAuditRetentionDays('attendance.record.marked', env)).toBe(2555);
  });

  it('applies family overrides for accountability-sensitive families', () => {
    expect(resolveAuditRetentionDays('auth.login.success', env)).toBe(3650);
    expect(resolveAuditRetentionDays('dataprotection.export.redacted', env)).toBe(3650);
  });

  it('honours the environment default override', () => {
    const withEnv = {
      [AUDIT_RETENTION_DEFAULT_DAYS_ENV]: '100',
    } as NodeJS.ProcessEnv;
    expect(resolveAuditRetentionDays('attendance.record.marked', withEnv)).toBe(100);
    // Aile kaydı env varsayılanını yine de geçersiz kılar.
    expect(resolveAuditRetentionDays('auth.login.success', withEnv)).toBe(3650);
  });

  it('fails closed on invalid or out-of-range environment values', () => {
    expect(() =>
      resolveAuditRetentionDays('attendance.record.marked', {
        [AUDIT_RETENTION_DEFAULT_DAYS_ENV]: '0',
      } as NodeJS.ProcessEnv),
    ).toThrow(/positive integer/);
    expect(() =>
      resolveAuditRetentionDays('attendance.record.marked', {
        [AUDIT_RETENTION_DEFAULT_DAYS_ENV]: 'abc',
      } as NodeJS.ProcessEnv),
    ).toThrow(/positive integer/);
    expect(() =>
      resolveAuditRetentionDays('attendance.record.marked', {
        [AUDIT_RETENTION_DEFAULT_DAYS_ENV]: '99999',
      } as NodeJS.ProcessEnv),
    ).toThrow(/<= 3650/);
  });

  it('computes the cutoff and eligibility at the boundary', () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    const cutoff = auditRetentionCutoff('attendance.record.marked', now, env);

    // 7 yıl (2555 gün) geriye gider; yıl olarak 2019'a düşer.
    expect(now.getTime() - cutoff.getTime()).toBe(
      DEFAULT_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(cutoff.getUTCFullYear()).toBe(2019);

    // Bir milisaniye daha eski → kırpılabilir; tam cutoff → değil.
    expect(
      isAuditRecordRetentionEligible(
        'attendance.record.marked',
        new Date(cutoff.getTime() - 1),
        now,
        env,
      ),
    ).toBe(true);
    expect(
      isAuditRecordRetentionEligible(
        'attendance.record.marked',
        cutoff,
        now,
        env,
      ),
    ).toBe(false);
  });
});
