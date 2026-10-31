import {
  isProductionEnvironment,
  KNOWN_ENVIRONMENT_NAMES,
  resolveRuntimeProfile,
} from './environment-profile';

/**
 * #259 P1B-02 AC-2 — local/test fallback "explicit, isolated and impossible in
 * production". Kritik regresyon: NODE_ENV set edilmemişse eski kod bunu
 * "production değil" sayıyor ve tahmin edilebilir fallback anahtarlarına izin
 * veriyordu. Artık belirsiz ortam fail-closed.
 */
describe('runtime environment profile (#259 AC-2)', () => {
  it.each(['production', 'PRODUCTION', ' prod '])(
    'classifies %s as production',
    (nodeEnv) => {
      expect(resolveRuntimeProfile({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv)).toBe('production');
    },
  );

  it.each(['development', 'dev', 'test', 'local', ' LOCAL '])(
    'classifies %s as an explicit local profile',
    (nodeEnv) => {
      expect(resolveRuntimeProfile({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv)).toBe('local');
    },
  );

  it('fails closed when NODE_ENV is unset (never silently treated as local)', () => {
    expect(() => resolveRuntimeProfile({} as NodeJS.ProcessEnv)).toThrow(
      /NODE_ENV must be explicitly set/,
    );
  });

  it('fails closed for an unknown NODE_ENV value instead of guessing', () => {
    expect(() =>
      resolveRuntimeProfile({ NODE_ENV: 'staging' } as NodeJS.ProcessEnv),
    ).toThrow(/NODE_ENV must be explicitly set/);
  });

  it('names the allowed values and never echoes secrets in the failure message', () => {
    const suppliedValue = 'super-secret-value-32-chars-min';
    let message = '';
    try {
      resolveRuntimeProfile({ JWT_ACCESS_SECRET: suppliedValue } as NodeJS.ProcessEnv);
    } catch (error) {
      message = (error as Error).message;
    }
    for (const allowed of KNOWN_ENVIRONMENT_NAMES) {
      expect(message).toContain(allowed);
    }
    expect(message).not.toContain('super-secret-value');
  });

  it('exposes the production predicate with the same fail-closed semantics', () => {
    expect(isProductionEnvironment({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isProductionEnvironment({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(false);
    expect(() => isProductionEnvironment({} as NodeJS.ProcessEnv)).toThrow();
  });
});
