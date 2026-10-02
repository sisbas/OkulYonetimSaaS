import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { RequestContext, RequestWithContext } from '../context/request-context';
import { Permissions } from '../decorators/permissions.decorator';
import { TenantScopeGuard } from '../tenant/tenant-scope.guard';
import { AuditQueryService, AuditQueryActor } from './audit-query.service';
import { AuditActionFilter, TenantScopedAuditQuery } from './transactional-audit.types';

const ENTITY_TYPES = [
  'course',
  'room',
  'time_slot',
  'leave_request',
  'auth',
  'dataprotection',
  'student',
  'teacher',
  'attendance',
  'notification',
  'audit',
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ACTION_FILTERS = 20;

function contextOf(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) {
    throw new UnauthorizedException('Authentication required');
  }
  const context = request.context;
  if (!context?.tenantId) throw new ForbiddenException('Tenant context required');
  return context;
}

function actorOf(context: RequestContext): AuditQueryActor {
  const userId = context.user?.userId ?? context.userId;
  if (!userId) throw new UnauthorizedException('Authentication required');
  return {
    actorUserId: userId,
    actorSessionId: context.user?.sessionId ?? null,
    requestId: context.requestId,
  };
}

function parseOptionalDate(value: string | undefined, field: string): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be an ISO-8601 date-time`);
  }
  return parsed;
}

function parseOptionalInteger(
  value: string | undefined,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseActions(value: string | undefined): AuditActionFilter[] | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return undefined;
  if (parts.length > MAX_ACTION_FILTERS) {
    throw new BadRequestException(`actions supports at most ${MAX_ACTION_FILTERS} filters`);
  }
  for (const part of parts) {
    if (part !== '*' && !/^[a-z0-9_.]+$/.test(part)) {
      throw new BadRequestException(`invalid action filter: ${part}`);
    }
  }
  return parts as AuditActionFilter[];
}

// Kimlik doğrulama (JWT) + kiracı sınırı; yetki her route'ta @Permissions ile
// zorunlu kılınır (metadata'sız route global guard'ları atlar — fail-open).
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('audit')
export class AuditController {
  constructor(
    private readonly query: AuditQueryService,
  ) {}

  /** Tenant-scoped, KVKK maskeli audit okuma (okuma işlemi de audit'lenir). */
  @Get('logs')
  @Permissions('audit_log:read')
  async logs(
    @Req() request: RequestWithContext,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('actions') actions?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const context = contextOf(request);
    if (entityType && !(ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw new BadRequestException(`unknown entityType: ${entityType}`);
    }
    if (entityId && !UUID_PATTERN.test(entityId)) {
      throw new BadRequestException('entityId must be a UUID');
    }
    if (actorUserId && !UUID_PATTERN.test(actorUserId)) {
      throw new BadRequestException('actorUserId must be a UUID');
    }

    const actionFilters = parseActions(actions);
    const fromCreatedAt = parseOptionalDate(from, 'from');
    const toCreatedAt = parseOptionalDate(to, 'to');
    const parsedLimit = parseOptionalInteger(limit, 'limit', 1, 500);
    const parsedOffset = parseOptionalInteger(offset, 'offset', 0, 100_000);

    const query: TenantScopedAuditQuery = {
      tenantId: context.tenantId as string,
      ...(entityType ? { entityType: entityType as TenantScopedAuditQuery['entityType'] } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...(actionFilters ? { actions: actionFilters } : {}),
      ...(fromCreatedAt ? { fromCreatedAt } : {}),
      ...(toCreatedAt ? { toCreatedAt } : {}),
      ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
      ...(parsedOffset !== undefined ? { offset: parsedOffset } : {}),
    };

    return this.query.list(query, actorOf(context));
  }

  /** Global chain verification requires platform authority, not tenant grants. */
  @Get('verify')
  @Permissions('audit_log:operations:read')
  verify(@Req() request: RequestWithContext) {
    contextOf(request);
    // The global hash chain cannot be tenant-filtered. Existing tenant DB grants
    // must not expose other tenants' counts/checkpoints or trigger global scans.
    // Keep a registered, controlled denial until platform authority is approved.
    throw new ForbiddenException('Audit verification is unavailable');
  }

  // #367: retention is platform-global, not a tenant operation. No HTTP
  // route is published, even for existing DB-granted retention permissions.
  // Internal retention policy/prune semantics remain in AuditRetentionService.
}
