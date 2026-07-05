import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RequestWithContext } from '../context/request-context';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    if (request.user) {
      const headerTenantId = request.header('x-tenant-id') ?? undefined;
      if (headerTenantId && headerTenantId !== request.user.tenantId) return false;
      request.context = { ...(request.context ?? { requestId: request.header('x-request-id') ?? 'unknown' }), tenantId: request.user.tenantId, user: request.user };
    }
    const userPermissions = request.user?.permissions ?? request.context?.user?.permissions ?? [];
    return required.every((permission) => userPermissions.includes(permission));
  }
}
