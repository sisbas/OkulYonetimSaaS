import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestWithContext } from '../context/request-context';
import { CrossTenantAccessError, TenantResolutionError, TenantScopeRequiredError } from './tenant-scope.error';
import { resolveTenantContext, buildRequestContextFromResolution } from './tenant-bootstrap';

/**
 * NestJS guard that enforces tenant isolation at the request boundary for any
 * route it is applied to. It re-resolves the tenant via the strict resolver and
 * refuses requests that:
 *  - have no resolvable tenant (401),
 *  - carry a tenant that conflicts between header and token (401/403),
 *  - resolve to a malformed tenant identifier (401).
 *
 * The resolved context is written back onto `req.context` so downstream
 * handlers and interceptors see a single, validated source of truth.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    try {
      const resolved = resolveTenantContext(req);
      req.context = buildRequestContextFromResolution(resolved);
      return true;
    } catch (error) {
      if (error instanceof TenantResolutionError) {
        // A header/token *mismatch* is a forbidden (403) cross-tenant attempt;
        // a missing/garbage tenant is an unauthenticated (401) request.
        throw error.mismatch ? new ForbiddenException(error.message) : new UnauthorizedException(error.message);
      }
      if (error instanceof CrossTenantAccessError) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof TenantScopeRequiredError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }
}
