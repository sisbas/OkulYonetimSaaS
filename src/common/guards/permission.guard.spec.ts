import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  const request = (permissions: string[]) => ({
    user: { permissions, tenantId: 'tenant_a' },
    header: jest.fn((name: string) => (name === 'x-request-id' ? 'req-test' : undefined)),
  });

  it('denies missing route permission', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['user:read']) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = { getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => request([]) }) } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows matching route permission', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['user:read']) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = { getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => request(['user:read']) }) } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(true);
  });
});
