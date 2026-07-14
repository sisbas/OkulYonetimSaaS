import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SecurityAuditService } from '../common/audit/security-audit.service';
import { RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

describe('RoomController RBAC contract', () => {
  const service = {
    create: jest.fn(),
    deactivate: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    reactivate: jest.fn(),
    update: jest.fn(),
  } as unknown as RoomService;

  it('maps endpoints to seeded room permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.create)).toEqual(['room:create']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.list)).toEqual(['room:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.get)).toEqual(['room:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.update)).toEqual(['room:update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.softDelete)).toEqual(['room:delete']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.deactivate)).toEqual(['room:archive']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.reactivate)).toEqual(['room:archive']);
  });

  it('returns unauthorized when controller is called without authenticated context', () => {
    const controller = new RoomController(service);

    expect(() => controller.list({ context: { requestId: 'req-1' } } as RequestWithContext, {})).toThrow(UnauthorizedException);
  });

  it('denies users without required room permission and emits authorization.denied', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['room:create']) } as unknown as Reflector;
    const audit = { emitAuthorizationDenied: jest.fn() } as unknown as jest.Mocked<SecurityAuditService>;
    const guard = new PermissionGuard(reflector, audit);
    const context = {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => (name === 'x-request-id' ? 'req-1' : undefined),
          user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-teacher'], permissions: ['room:read'] },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
    expect(audit.emitAuthorizationDenied).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', user: expect.objectContaining({ userId: 'user-1' }) }),
      { requiredPermission: ['room:create'], resource: 'room', reasonCode: 'missing_permission' },
    );
  });

  it('allows users with the required room permission without denied audit', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['room:create']) } as unknown as Reflector;
    const audit = { emitAuthorizationDenied: jest.fn() } as unknown as jest.Mocked<SecurityAuditService>;
    const guard = new PermissionGuard(reflector, audit);
    const context = {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          header: () => undefined,
          user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-admin'], permissions: ['room:create'] },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(audit.emitAuthorizationDenied).not.toHaveBeenCalled();
  });
});
