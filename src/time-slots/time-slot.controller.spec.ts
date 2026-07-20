import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SecurityAuditService } from '../common/audit/security-audit.service';
import { RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TimeSlotController } from './time-slot.controller';
import { TimeSlotService } from './time-slot.service';

describe('TimeSlotController RBAC contract', () => {
  const service = {
    list: jest.fn(), calendar: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), archive: jest.fn(), reactivate: jest.fn(),
  } as unknown as TimeSlotService;

  it('maps all endpoints to seeded permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimeSlotController.prototype.list)).toEqual(['time_slot:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimeSlotController.prototype.calendar)).toEqual(['time_slot:calendar:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimeSlotController.prototype.get)).toEqual(['time_slot:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimeSlotController.prototype.create)).toEqual(['time_slot:create']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimeSlotController.prototype.update)).toEqual(['time_slot:update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimeSlotController.prototype.archive)).toEqual(['time_slot:delete']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TimeSlotController.prototype.reactivate)).toEqual(['time_slot:update']);
  });

  it('requires authenticated tenant context', () => {
    const controller = new TimeSlotController(service);
    expect(() => controller.list({ context: { requestId: 'req-1' } } as RequestWithContext, { branchId: 'branch-a' })).toThrow(UnauthorizedException);
  });

  it.each(['time_slot:create', 'time_slot:update', 'time_slot:delete', 'time_slot:calendar:read'])(
    'denies teacher role for %s',
    (requiredPermission) => {
      const reflector = { getAllAndOverride: jest.fn(() => [requiredPermission]) } as unknown as Reflector;
      const audit = { emitAuthorizationDenied: jest.fn() } as unknown as jest.Mocked<SecurityAuditService>;
      const guard = new PermissionGuard(reflector, audit);
      const context = {
        getClass: jest.fn(), getHandler: jest.fn(),
        switchToHttp: () => ({ getRequest: () => ({
          header: () => undefined,
          context: { requestId: 'req-1', tenantId: 'tenant-a' },
          user: { userId: 'teacher-1', tenantId: 'tenant-a', roleIds: ['teacher'], permissions: ['time_slot:read'] },
        }) }),
      } as unknown as ExecutionContext;
      expect(guard.canActivate(context)).toBe(false);
      expect(audit.emitAuthorizationDenied).toHaveBeenCalled();
    },
  );
});
