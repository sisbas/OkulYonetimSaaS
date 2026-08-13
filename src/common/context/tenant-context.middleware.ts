import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Response } from 'express';
import { RequestWithContext } from './request-context';
import { TenantResolutionError } from '../tenant/tenant-scope.error';
import {
  buildRequestContextFromResolution,
  resolveTenantContext,
} from '../tenant/tenant-bootstrap';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: RequestWithContext, _res: Response, next: NextFunction) {
    const requestId = req.header('x-request-id') ?? randomUUID();
    // The global middleware stays permissive so unauthenticated routes
    // (health, auth, unknown paths) still reach downstream guards and can
    // return the correct 401/404. We only hard-block an active cross-tenant
    // spoof (header vs. token mismatch) here; strict validation (UUID format,
    // required tenant, bootstrap verification) is enforced by TenantScopeGuard
    // and the repository/helper layer.
    try {
      const resolved = resolveTenantContext(req, {
        requestId,
        requireTenant: false,
        validateFormat: false,
      });
      req.context = buildRequestContextFromResolution(resolved);
    } catch (error) {
      if (error instanceof TenantResolutionError && error.mismatch) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
    next();
  }
}
