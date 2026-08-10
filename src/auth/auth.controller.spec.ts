import { BadRequestException } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it.each(['userId', 'roles', 'roleIds', 'permissions', 'permissionIds', 'teacherId', 'tenant_id'])(
    'rejects client-controlled authority claim %s at login',
    async (field) => {
      const auth = { login: jest.fn() } as unknown as AuthService;
      const controller = new AuthController(auth);

      await expect(controller.login({
        email: 'teacher@example.test',
        password: 'secret',
        [field]: field === 'permissions' ? ['tenant:update'] : 'forged',
      } as never)).rejects.toBeInstanceOf(BadRequestException);

      expect(auth.login).not.toHaveBeenCalled();
    },
  );

  it('passes only credentials, optional tenant selector and request id to the service', async () => {
    const login = jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
    const auth = { login } as unknown as AuthService;
    const controller = new AuthController(auth);

    await controller.login(
      {
        email: 'teacher@example.test',
        password: 'secret',
        tenantId: '10000000-0000-4000-8000-000000000100',
      },
      { context: { requestId: 'req-auth-1' } } as never,
    );

    expect(login).toHaveBeenCalledWith({
      email: 'teacher@example.test',
      password: 'secret',
      tenantId: '10000000-0000-4000-8000-000000000100',
      requestId: 'req-auth-1',
    });
  });

  it('forwards the refresh token and request id to the service', async () => {
    const rotateRefreshToken = jest.fn().mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2', refreshTokenId: 'id2' });
    const auth = { rotateRefreshToken } as unknown as AuthService;
    const controller = new AuthController(auth);

    await controller.refresh(
      { refreshToken: 'rt-1' },
      { context: { requestId: 'req-refresh-1' } } as never,
    );

    expect(rotateRefreshToken).toHaveBeenCalledWith('rt-1', 'req-refresh-1');
  });

  it('rejects a missing refresh token without calling the service', async () => {
    const rotateRefreshToken = jest.fn();
    const auth = { rotateRefreshToken } as unknown as AuthService;
    const controller = new AuthController(auth);

    await expect(controller.refresh({} as never, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(rotateRefreshToken).not.toHaveBeenCalled();
  });
});
