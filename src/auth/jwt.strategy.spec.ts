import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AUTH_ACCESS_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER, AuthService } from './auth.service';
import { resolveJwtKey, resolveJwtTokenContract } from './jwt-keyring';
import { JwtStrategy } from './jwt.strategy';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const TENANT_ID = '20000000-0000-4000-8000-000000000001';
const SESSION_ID = '30000000-0000-4000-8000-000000000001';

describe('JwtStrategy', () => {
  it('ignores forged token roles and permissions and asks AuthService for the current session authority', async () => {
    const currentUser = {
      userId: USER_ID,
      tenantId: TENANT_ID,
      sessionId: SESSION_ID,
      authorizationVersion: 2,
      roleIds: ['teacher'],
      permissions: ['leave:create'],
    };
    const auth = {
      validateAccessTokenSession: jest.fn().mockResolvedValue(currentUser),
    } as unknown as AuthService;
    const strategy = new JwtStrategy(auth);

    await expect(strategy.validate({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      session_id: SESSION_ID,
      jti: SESSION_ID,
      authorization_version: 2,
      roles: ['tenant_admin'],
      permissions: ['tenant:update', 'role:assign'],
    })).resolves.toBe(currentUser);

    expect(auth.validateAccessTokenSession).toHaveBeenCalledWith({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      session_id: SESSION_ID,
      jti: SESSION_ID,
      authorization_version: 2,
    });
  });

  it('rejects tokens that lack server-issued session and authorization version claims', async () => {
    const auth = { validateAccessTokenSession: jest.fn() } as unknown as AuthService;
    const strategy = new JwtStrategy(auth);

    await expect(strategy.validate({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      roles: ['tenant_admin'],
      permissions: ['tenant:update'],
    })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auth.validateAccessTokenSession).not.toHaveBeenCalled();
  });

  describe('boot fail-closed (secret missing)', () => {
    const ORIGINAL_ACCESS = process.env.JWT_ACCESS_SECRET;
    afterEach(() => {
      process.env.JWT_ACCESS_SECRET = ORIGINAL_ACCESS;
    });

    it('throws when JWT_ACCESS_SECRET is missing (no predictable dev fallback)', () => {
      delete process.env.JWT_ACCESS_SECRET;
      const auth = { validateAccessTokenSession: jest.fn() } as unknown as AuthService;
      expect(() => new JwtStrategy(auth)).toThrow(/JWT_ACCESS_SECRET is required/);
    });
  });

  describe('key id (kid) enforcement (#259 AC-3)', () => {
    type StrategyInternals = {
      _secretOrKeyProvider: (
        request: unknown,
        rawToken: string,
        done: (error: Error | null, secret?: string) => void,
      ) => void;
      _verifOpts: { issuer?: string; audience?: string; algorithms?: string[] };
    };

    const strategyInternals = (): StrategyInternals => {
      const auth = { validateAccessTokenSession: jest.fn() } as unknown as AuthService;
      return new JwtStrategy(auth) as unknown as StrategyInternals;
    };

    it('pins issuer, audience and the HS256 algorithm', () => {
      const strategy = strategyInternals();
      const contract = resolveJwtTokenContract();

      expect(strategy._verifOpts.issuer).toBe(contract.issuer);
      expect(strategy._verifOpts.audience).toBe(contract.accessAudience);
      expect(strategy._verifOpts.algorithms).toEqual(['HS256']);
    });

    it('accepts a token carrying the active key id', () => {
      const jwt = new JwtService({});
      const key = resolveJwtKey('access');
      const token = jwt.sign(
        { sub: USER_ID },
        { secret: key.secret, keyid: key.keyId, issuer: AUTH_TOKEN_ISSUER, audience: AUTH_ACCESS_TOKEN_AUDIENCE },
      );
      const done = jest.fn();

      strategyInternals()._secretOrKeyProvider({}, token, done);

      expect(done).toHaveBeenCalledWith(null, key.secret);
    });

    it('rejects a token signed with a retired key id or without a key id', () => {
      const jwt = new JwtService({});
      const key = resolveJwtKey('access');
      const options = {
        secret: key.secret,
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_ACCESS_TOKEN_AUDIENCE,
      };
      const retired = jwt.sign({ sub: USER_ID }, { ...options, keyid: 'retired-key' });
      const withoutKid = jwt.sign({ sub: USER_ID }, options);
      const strategy = strategyInternals();

      for (const token of [retired, withoutKid]) {
        const done = jest.fn();
        strategy._secretOrKeyProvider({}, token, done);
        expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
        // Anahtar hiç verilmez → jsonwebtoken imzayı doğrulayamaz.
        expect(done.mock.calls[0][1]).toBeUndefined();
      }
    });

    it('never echoes the secret in the rejection reason', () => {
      const jwt = new JwtService({});
      const key = resolveJwtKey('access');
      const token = jwt.sign({ sub: USER_ID }, { secret: key.secret, keyid: 'retired-key' });
      const done = jest.fn();

      strategyInternals()._secretOrKeyProvider({}, token, done);

      const error = done.mock.calls[0][0] as Error;
      expect(error.message).toMatch(/key id mismatch/);
      expect(error.message).not.toContain(key.secret);
    });
  });
});

