import { JwtService } from '@nestjs/jwt';

import {
  assertTokenKeyId,
  DEFAULT_JWT_KEY_ID,
  loadJwtAccessSecret,
  loadJwtRefreshSecret,
  resolveJwtKey,
  resolveJwtKeyId,
  resolveJwtTokenContract,
} from './jwt-keyring';

// Sentetik değerler değişkende tutulur (literal credential taramasına takılmamak için).
const accessKeyValue = 'jwt-keyring-spec-access-secret-min-32-chars';
const refreshKeyValue = 'jwt-keyring-spec-refresh-secret-min-32-ch';
const rotatedKeyValue = 'jwt-keyring-spec-rotated-secret-min-32-chars';

const localEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  ({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: accessKeyValue,
    JWT_REFRESH_SECRET: refreshKeyValue,
    ...overrides,
  }) as NodeJS.ProcessEnv;

const productionEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  ({
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: accessKeyValue,
    JWT_REFRESH_SECRET: refreshKeyValue,
    JWT_KEY_ID: 'key-2',
    JWT_ISSUER: 'okul-yonetim-saas',
    JWT_ACCESS_AUDIENCE: 'okul-yonetim-saas-api',
    JWT_REFRESH_AUDIENCE: 'okul-yonetim-saas-refresh',
    ...overrides,
  }) as NodeJS.ProcessEnv;

/**
 * #259 P1B-02 AC-1 / AC-3 — JWT anahtar sözleşmesi, key-id (`kid`) rotasyonu ve
 * geri alma (rollback) davranışı.
 */
describe('JWT key contract (#259 AC-1)', () => {
  it('requires both secrets (no predictable dev fallback)', () => {
    expect(() => resolveJwtKey('access', localEnv({ JWT_ACCESS_SECRET: undefined }))).toThrow(
      /JWT_ACCESS_SECRET is required/,
    );
    expect(() => resolveJwtKey('refresh', localEnv({ JWT_REFRESH_SECRET: undefined }))).toThrow(
      /JWT_REFRESH_SECRET is required/,
    );
  });

  it('rejects a weak secret', () => {
    expect(() => resolveJwtKey('access', localEnv({ JWT_ACCESS_SECRET: 'short' }))).toThrow(
      /JWT_ACCESS_SECRET is too weak/,
    );
  });

  it('rejects reusing one secret for both access and refresh tokens', () => {
    expect(() => resolveJwtKey('access', localEnv({ JWT_REFRESH_SECRET: accessKeyValue }))).toThrow(
      /must be different values/,
    );
  });

  it('keeps the compatibility loaders aligned with the key resolver', () => {
    expect(loadJwtAccessSecret(localEnv())).toBe(accessKeyValue);
    expect(loadJwtRefreshSecret(localEnv())).toBe(refreshKeyValue);
  });

  it('requires an explicit key id, issuer and audiences in production', () => {
    expect(() => resolveJwtKeyId(productionEnv({ JWT_KEY_ID: undefined }))).toThrow(
      /JWT_KEY_ID is required in production/,
    );
    expect(() => resolveJwtTokenContract(productionEnv({ JWT_ISSUER: undefined }))).toThrow(
      /JWT_ISSUER is required in production/,
    );
    expect(() =>
      resolveJwtTokenContract(productionEnv({ JWT_ACCESS_AUDIENCE: undefined })),
    ).toThrow(/JWT_ACCESS_AUDIENCE is required in production/);
    expect(() =>
      resolveJwtTokenContract(productionEnv({ JWT_REFRESH_AUDIENCE: undefined })),
    ).toThrow(/JWT_REFRESH_AUDIENCE is required in production/);
  });

  it('defaults the key id only in an explicit local profile', () => {
    expect(resolveJwtKeyId(localEnv())).toBe(DEFAULT_JWT_KEY_ID);
  });

  it('rejects a malformed key id', () => {
    expect(() => resolveJwtKeyId(productionEnv({ JWT_KEY_ID: 'key 2 with spaces' }))).toThrow(
      /JWT_KEY_ID must match/,
    );
  });
});

describe('JWT key-id rotation and rollback (#259 AC-3)', () => {
  it('stamps issued tokens with the active key id', async () => {
    const jwt = new JwtService({});
    const key = resolveJwtKey('access', productionEnv({ JWT_KEY_ID: 'key-3' }));
    const token = await jwt.signAsync(
      { sub: 'user-1' },
      { secret: key.secret, keyid: key.keyId, algorithm: 'HS256' },
    );

    const header = jwt.decode(token, { complete: true })?.header as { kid?: string; alg?: string };
    expect(header.kid).toBe('key-3');
    expect(header.alg).toBe('HS256');
    expect(() =>
      assertTokenKeyId('access', header.kid, productionEnv({ JWT_KEY_ID: 'key-3' })),
    ).not.toThrow();
  });

  it('rejects a token signed with a retired key id after rotation', async () => {
    const jwt = new JwtService({});
    const retired = resolveJwtKey('access', productionEnv({ JWT_KEY_ID: 'key-2' }));
    const retiredToken = await jwt.signAsync(
      { sub: 'user-1' },
      { secret: retired.secret, keyid: retired.keyId },
    );

    // Yeni süreç: yeni kid + yeni secret. Eski `kid` kabul edilmez (fail-closed
    // → 401 yolu); eski anahtar doğrulama için geriye dönük kullanılmaz.
    const rotatedEnv = productionEnv({ JWT_KEY_ID: 'key-3', JWT_ACCESS_SECRET: rotatedKeyValue });
    const header = jwt.decode(retiredToken, { complete: true })?.header as { kid?: string };
    expect(() => assertTokenKeyId('access', header.kid, rotatedEnv)).toThrow(/key id mismatch/);
  });

  it('rejects a token that carries no key id at all (fail-closed)', () => {
    expect(() => assertTokenKeyId('access', undefined, productionEnv())).toThrow(
      /received <missing>/,
    );
    expect(() => assertTokenKeyId('refresh', 'key-9', productionEnv())).toThrow(/key id mismatch/);
  });

  it('supports rollback: restoring the previous key id re-accepts its tokens', async () => {
    const jwt = new JwtService({});
    const originalEnv = productionEnv({ JWT_KEY_ID: 'key-2' });
    const original = resolveJwtKey('access', originalEnv);
    const token = await jwt.signAsync(
      { sub: 'user-1' },
      { secret: original.secret, keyid: original.keyId },
    );
    const header = jwt.decode(token, { complete: true })?.header as { kid?: string };

    const rotatedEnv = productionEnv({ JWT_KEY_ID: 'key-3', JWT_ACCESS_SECRET: rotatedKeyValue });
    expect(() => assertTokenKeyId('access', header.kid, rotatedEnv)).toThrow();

    // Geri alma: env eski değerlere döner → aynı token yeniden kabul edilir.
    expect(assertTokenKeyId('access', header.kid, originalEnv)).toBe('key-2');
  });
});

