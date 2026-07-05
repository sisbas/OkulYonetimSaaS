import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  it('denies missing route permission', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['user:read']) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = { getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => ({ user: { permissions: [] } }) }) } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows matching route permission', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['user:read']) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = { getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => ({ user: { permissions: ['user:read'] } }) }) } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(true);
  });
});
