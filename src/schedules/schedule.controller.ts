import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { NON_ENUMERATING_NOT_FOUND_MESSAGE } from '../common/context/deny-response';
import { Permissions, PermissionsAny } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { ScheduleService } from './schedule.service';
import { ScheduleReadService } from './schedule-read.service';
import { CreateScheduleInput, SaveDraftInput } from './schedule.service';
import { ScheduleEventDraft } from './m3-schedule-contract';
import {
  IF_MATCH_HEADER,
  assertScheduleIfMatchResource,
  parseScheduleIfMatch,
  scheduleEtag,
} from './schedule-revision';

function getRequestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) {
    throw new ForbiddenException('Authentication required');
  }
  if (!request.context?.tenantId) {
    throw new ForbiddenException('Tenant context required');
  }
  return request.context;
}

function requestIdOf(ctx: RequestContext): string {
  return ctx.requestId ?? 'req-internal';
}

/** Aktif şube zorunlu: branch-scoped controller'larda guard bunu sağlar; savunma mantığı. */
function branchOf(ctx: RequestContext): string {
  const branchId = ctx.branch?.branchId ?? ctx.branchId;
  if (!branchId) {
    throw new NotFoundException(NON_ENUMERATING_NOT_FOUND_MESSAGE);
  }
  return branchId;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function isoQuery(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === '' || !DATE_PATTERN.test(value)) return null; // geçersiz → 400
  return value;
}

/** Liste uçları için opak ETag (max revizyonu sayfanın sürümünü ifade eder). */
function listEtag(count: number, revisions: readonly number[]): string {
  const max = revisions.reduce((acc, value) => Math.max(acc, value), 0);
  return `"schedule:list:${count}:v${max}"`;
}

// Tenant isolation: tenantId + actorId are resolved from the verified JWT /
// tenant context (TenantScopeGuard), NEVER from the request body.
@Controller('schedules')
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
export class ScheduleController {
  constructor(
    private readonly service: ScheduleService,
    private readonly reads: ScheduleReadService,
  ) {}

  @Post('drafts')
  @HttpCode(201)
  @Permissions('schedule:draft:create')
  async create(
    @Req() request: RequestWithContext,
    @Body() body: { branchId: string; effectiveFrom: string; effectiveTo?: string | null },
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const input: CreateScheduleInput = {
      tenantId: ctx.tenantId!,
      branchId: body.branchId,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null,
    };
    const schedule = await this.service.createSchedule(input);
    response.setHeader('ETag', scheduleEtag(schedule.id, schedule.revision));
    return schedule;
  }

  @Post(':scheduleId/draft')
  @HttpCode(200)
  @Permissions('schedule:draft:update')
  async saveDraft(
    @Req() request: RequestWithContext,
    @Param('scheduleId') scheduleId: string,
    @Headers(IF_MATCH_HEADER) ifMatch: string,
    @Body() body: { branchId: string; events: ScheduleEventDraft[] },
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const token = assertScheduleIfMatchResource(parseScheduleIfMatch(ifMatch), scheduleId);
    const input: SaveDraftInput = {
      tenantId: ctx.tenantId!,
      branchId: body.branchId,
      scheduleId,
      events: body.events,
      expectedRevision: token.revision,
    };
    const version = await this.service.saveDraft(input);
    // Persisted revizyon tam olarak bir artırıldı.
    response.setHeader('ETag', scheduleEtag(scheduleId, token.revision + 1));
    return version;
  }

  @Post(':scheduleId/validate')
  @HttpCode(200)
  @Permissions('schedule:validate', 'schedule:conflict:read')
  async validate(
    @Req() request: RequestWithContext,
    @Param('scheduleId') scheduleId: string,
    @Headers(IF_MATCH_HEADER) ifMatch: string,
    @Body() body: { branchId: string; events: ScheduleEventDraft[] },
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const token = assertScheduleIfMatchResource(parseScheduleIfMatch(ifMatch), scheduleId);
    const evidence = await this.service.validateDraft(
      ctx.tenantId!,
      body.branchId,
      scheduleId,
      body.events,
      token.revision,
    );
    response.setHeader('ETag', scheduleEtag(scheduleId, token.revision));
    return evidence;
  }

  @Post(':scheduleId/publish')
  @HttpCode(200)
  @Permissions('schedule:publish')
  async publish(
    @Req() request: RequestWithContext,
    @Param('scheduleId') scheduleId: string,
    @Headers(IF_MATCH_HEADER) ifMatch: string,
    @Body() body: { branchId: string; events: ScheduleEventDraft[] },
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const token = assertScheduleIfMatchResource(parseScheduleIfMatch(ifMatch), scheduleId);
    const version = await this.service.publish(
      ctx.tenantId!,
      body.branchId,
      scheduleId,
      ctx.user!.userId,
      requestIdOf(ctx),
      body.events,
      token.revision,
    );
    response.setHeader('ETag', scheduleEtag(scheduleId, token.revision));
    return version;
  }

  @Post(':scheduleId/unpublish')
  @HttpCode(200)
  @Permissions('schedule:publish')
  async unpublish(
    @Req() request: RequestWithContext,
    @Param('scheduleId') scheduleId: string,
    @Headers(IF_MATCH_HEADER) ifMatch: string,
    @Body() body: { branchId: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const token = assertScheduleIfMatchResource(parseScheduleIfMatch(ifMatch), scheduleId);
    await this.service.unpublish(
      ctx.tenantId!,
      body.branchId,
      scheduleId,
      ctx.user!.userId,
      requestIdOf(ctx),
      token.revision,
    );
    response.setHeader('ETag', scheduleEtag(scheduleId, token.revision));
    return { ok: true };
  }

  @Get('drafts')
  @Permissions('schedule:draft:read')
  async listDrafts(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const branchId = branchOf(ctx);
    const items = await this.reads.listManagementDrafts({ tenantId: ctx.tenantId!, branchId });
    response.setHeader('ETag', listEtag(items.length, items.map((item) => item.revision)));
    return items;
  }

  @Get('published')
  @PermissionsAny('schedule:read', 'schedule:own:read')
  async listPublished(
    @Req() request: RequestWithContext,
    @Query('from') fromRaw: string | undefined,
    @Query('to') toRaw: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const branchId = branchOf(ctx);
    const from = isoQuery(fromRaw);
    const to = isoQuery(toRaw);
    if (from === null || to === null) {
      throw new BadRequestException('from/to must be an ISO date (YYYY-MM-DD)');
    }
    const items = await this.reads.listPublished({
      tenantId: ctx.tenantId!,
      branchId,
      ctx,
      from,
      to,
    });
    response.setHeader('ETag', listEtag(items.length, items.map((item) => item.revision)));
    return items;
  }

  @Get(':scheduleId')
  @PermissionsAny('schedule:draft:read', 'schedule:read', 'schedule:own:read')
  async readSchedule(
    @Req() request: RequestWithContext,
    @Param('scheduleId', new ParseUUIDPipe()) scheduleId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ctx = getRequestContext(request);
    const branchId = branchOf(ctx);
    const schedule = await this.reads.readSchedule({
      tenantId: ctx.tenantId!,
      branchId,
      scheduleId,
      ctx,
    });
    response.setHeader('ETag', scheduleEtag(scheduleId, schedule.revision));
    return schedule;
  }
}
