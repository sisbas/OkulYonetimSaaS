import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Response } from 'express';
import { RequestWithContext } from './request-context';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: RequestWithContext, _res: Response, next: NextFunction) {
    const headerTenantId = req.header('x-tenant-id') ?? undefined;
    const jwtTenantId = req.user?.tenantId;

    if (headerTenantId && jwtTenantId && headerTenantId !== jwtTenantId) {
      throw new ForbiddenException('X-Tenant-Id does not match token tenant_id');
    }

    req.context = {
      requestId: req.header('x-request-id') ?? randomUUID(),
      tenantId: jwtTenantId ?? headerTenantId,
      user: req.user,
    };
    next();
  }
}
