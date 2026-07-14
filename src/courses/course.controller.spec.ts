import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';

describe('CourseController RBAC contract', () => {
  const service = {
    create: jest.fn(),
    deactivate: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    reactivate: jest.fn(),
    update: jest.fn(),
  } as unknown as CourseService;

  it('maps endpoints to seeded course permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CourseController.prototype.create)).toEqual(['course:create']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CourseController.prototype.list)).toEqual(['course:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CourseController.prototype.get)).toEqual(['course:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CourseController.prototype.update)).toEqual(['course:update']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CourseController.prototype.deactivate)).toEqual(['course:archive']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, CourseController.prototype.reactivate)).toEqual(['course:archive']);
  });

  it('returns unauthorized when controller is called without authenticated context', () => {
    const controller = new CourseController(service);

    expect(() => controller.list({ context: { requestId: 'req-1' } } as RequestWithContext, {})).toThrow(UnauthorizedException);
  });

  it('denies users without required permission through PermissionGuard', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['course:create']) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          header: () => undefined,
          user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-teacher'], permissions: ['course:read'] },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows users with the required course permission', () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['course:create']) } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          header: () => undefined,
          user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-admin'], permissions: ['course:create'] },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
