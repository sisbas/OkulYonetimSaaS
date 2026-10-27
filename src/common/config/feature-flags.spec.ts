import {
  contextCapabilities,
  isStrategicGoalsEnabled,
  STRATEGIC_GOALS_CAPABILITY,
  STRATEGIC_GOALS_ENABLED_ENV,
} from './feature-flags';

/**
 * #482 — Stratejik hedefler açma/kapama sözleşmesi (ADR 0003 D2/D3).
 *
 * Varsayılan kapalı olması güvenlik gereğidir: yanlış yazılmış bir env
 * değeri (boş, `1`, `TRUE`) yüzeyi açmamalıdır.
 */
describe('#482 strategic goals feature flag', () => {
  function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
    return values as NodeJS.ProcessEnv;
  }

  it.each([
    ['undefined', env({})],
    ['empty string', env({ [STRATEGIC_GOALS_ENABLED_ENV]: '' })],
    ['false', env({ [STRATEGIC_GOALS_ENABLED_ENV]: 'false' })],
    ['numeric 1', env({ [STRATEGIC_GOALS_ENABLED_ENV]: '1' })],
    ['uppercase TRUE', env({ [STRATEGIC_GOALS_ENABLED_ENV]: 'TRUE' })],
    ['padded " true "', env({ [STRATEGIC_GOALS_ENABLED_ENV]: ' true ' })],
  ])('stays disabled for %s', (_label, values) => {
    expect(isStrategicGoalsEnabled(values)).toBe(false);
    expect(contextCapabilities(values)).toEqual([]);
  });

  it('opens only for the literal string "true"', () => {
    const values = env({ [STRATEGIC_GOALS_ENABLED_ENV]: 'true' });
    expect(isStrategicGoalsEnabled(values)).toBe(true);
    expect(contextCapabilities(values)).toEqual([STRATEGIC_GOALS_CAPABILITY]);
  });

  it('publishes a capability key, never a permission code', () => {
    expect(STRATEGIC_GOALS_CAPABILITY).not.toContain(':');
    expect(contextCapabilities(env({ [STRATEGIC_GOALS_ENABLED_ENV]: 'true' }))).not.toContain(
      'strategic_goal:read',
    );
  });
});
