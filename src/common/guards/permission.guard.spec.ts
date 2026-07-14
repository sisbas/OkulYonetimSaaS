import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityAuditService } from '../audit/security-audit.service';
import { PermissionGuard } from './permission.guard';

function auditMock(): jest.Mocked<Pick<SecurityAuditService, 'emitAuthorizationDenied'>> {
  return { emitAuthorizationDenied: jest.fn() };
}

describe('PermissionGuard', () => {
  const request = (permissions: string[]) => ({
    user: { userId: 'user-1', permissions, tenantId: 'tenant_a', roleIds: ['role-1'] },
    header: jest.fn((name: string) => (name === 'x-request-id' ? 'req-test' : undefined)),
  });

  it('denies missing route permission and emits authorization.denied', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['user:read']) } as unknown as Reflector;
    const audit = auditMock();
    const guard = new PermissionGuard(reflector, audit as SecurityAuditService);
    const context = { getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => request([]) }) } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
    expect(audit.emitAuthorizationDenied).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_a' }),
      { requiredPermission: ['user:read'], resource: 'user', reasonCode: 'missing_permission' },
    );
  });

  it('allows matching route permission', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['user:read']) } as unknown as Reflector;
    const audit = auditMock();
    const guard = new PermissionGuard(reflector, audit as SecurityAuditService);
    const context = { getHandler: jest.fn(), getClass: jest.fn(), switchToHttp: () => ({ getRequest: () => request(['user:read']) }) } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(audit.emitAuthorizationDenied).not.toHaveBeenCalled();
  });
});
