import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Authenticates only handlers that declare permission metadata. Register this
 * APP_GUARD before PermissionGuard so authorization never evaluates an empty
 * request.user, while public/authentication endpoints remain unaffected.
 */
@Injectable()
export class PermissionAuthenticationGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    return super.canActivate(context);
  }
}
