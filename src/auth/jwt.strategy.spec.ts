import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
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
});
