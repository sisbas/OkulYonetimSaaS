import { loadJwtAccessSecret, loadJwtRefreshSecret } from './auth.service';

describe('JWT secret fail-closed loader (#259 P1B-02)', () => {
  const ORIGINAL_ACCESS = process.env.JWT_ACCESS_SECRET;
  const ORIGINAL_REFRESH = process.env.JWT_REFRESH_SECRET;

  afterEach(() => {
    process.env.JWT_ACCESS_SECRET = ORIGINAL_ACCESS;
    process.env.JWT_REFRESH_SECRET = ORIGINAL_REFRESH;
  });

  it('throws when JWT_ACCESS_SECRET is missing', () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => loadJwtAccessSecret()).toThrow(/JWT_ACCESS_SECRET is required/);
  });

  it('throws when JWT_REFRESH_SECRET is missing', () => {
    delete process.env.JWT_REFRESH_SECRET;
    expect(() => loadJwtRefreshSecret()).toThrow(/JWT_REFRESH_SECRET is required/);
  });

  it('throws when JWT_ACCESS_SECRET is too weak (<32 chars)', () => {
    process.env.JWT_ACCESS_SECRET = 'short-secret';
    expect(() => loadJwtAccessSecret()).toThrow(/too weak/);
  });

  it('throws when JWT_REFRESH_SECRET is too weak (<32 chars)', () => {
    process.env.JWT_REFRESH_SECRET = 'short-secret';
    expect(() => loadJwtRefreshSecret()).toThrow(/too weak/);
  });

  it('returns the secret when present and strong (>=32 chars)', () => {
    process.env.JWT_ACCESS_SECRET = 'a-strong-access-secret-with-at-least-32-chars!!';
    process.env.JWT_REFRESH_SECRET = 'a-strong-refresh-secret-with-at-least-32-chars!';
    expect(loadJwtAccessSecret()).toBe('a-strong-access-secret-with-at-least-32-chars!!');
    expect(loadJwtRefreshSecret()).toBe('a-strong-refresh-secret-with-at-least-32-chars!');
  });
});
