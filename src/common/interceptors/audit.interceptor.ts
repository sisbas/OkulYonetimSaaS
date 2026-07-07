import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_ACTION_KEY, AuditActionOptions } from '../decorators/audit-action.decorator';
import { RequestWithContext } from '../context/request-context';

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'credential',
  'secret',
  'refreshtoken',
  'accesstoken',
  'token',
  'authorization',
  'email',
  'phone',
  'phonenumber',
  'parentphone',
  'guardianphone',
  'parentcontact',
  'guardiancontact',
  'counselingnote',
  'guidancenote',
  'sensitivecounselingnote',
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      isSensitiveKey(key) ? '[REDACTED]' : sanitize(val),
    ]),
  );
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const audit = this.reflector.getAllAndOverride<AuditActionOptions>(AUDIT_ACTION_KEY, [context.getHandler(), context.getClass()]);
    if (!audit) return next.handle();
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const startedAt = Date.now();
    return next.handle().pipe(tap(() => {
      this.logger.log(JSON.stringify({
        action: audit.action,
        resource: audit.resource,
        tenantId: request.context?.tenantId,
        userId: request.context?.user?.userId,
        requestId: request.context?.requestId,
        durationMs: Date.now() - startedAt,
        body: sanitize(request.body),
      }));
    }));
  }
}
