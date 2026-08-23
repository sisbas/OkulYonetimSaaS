import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { ScheduleService } from './schedule.service';
import { CreateScheduleInput, SaveDraftInput } from './schedule.service';
import { ScheduleEventDraft } from './m3-schedule-contract';

function getRequestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) {
    throw new ForbiddenException('Authentication required');
  }
  if (!request.context?.tenantId) {
    throw new ForbiddenException('Tenant context required');
  }
  return request.context;
}

// Tenant isolation: tenantId + actorId are resolved from the verified JWT /
// tenant context (TenantScopeGuard), NEVER from the request body.
@Controller('schedules')
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Post()
  @Permissions('schedule:create')
  async create(@Req() request: RequestWithContext, @Body() body: { branchId: string; effectiveFrom: string; effectiveTo?: string | null }) {
    const ctx = getRequestContext(request);
    return this.service.createSchedule({
      tenantId: ctx.tenantId!,
      branchId: body.branchId,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null,
    });
  }

  @Post(':id/draft')
  @Permissions('schedule:update')
  async saveDraft(
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() body: { branchId: string; events: ScheduleEventDraft[] },
  ) {
    const ctx = getRequestContext(request);
    const input: SaveDraftInput = {
      tenantId: ctx.tenantId!,
      branchId: body.branchId,
      scheduleId: id,
      events: body.events,
    };
    return this.service.saveDraft(input);
  }

  @Post(':id/validate')
  @Permissions('schedule:read')
  async validate(
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() body: { branchId: string; events: ScheduleEventDraft[]; revision: number },
  ) {
    const ctx = getRequestContext(request);
    return this.service.validateDraft(ctx.tenantId!, body.branchId, id, body.events, body.revision);
  }

  @Post(':id/publish')
  @Permissions('schedule:publish')
  async publish(
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() body: { branchId: string; events: ScheduleEventDraft[]; revision: number; requestId: string },
  ) {
    const ctx = getRequestContext(request);
    return this.service.publish(
      ctx.tenantId!,
      body.branchId,
      id,
      ctx.user!.userId,
      body.requestId,
      body.events,
      body.revision,
    );
  }

  @Post(':id/unpublish')
  @Permissions('schedule:publish')
  async unpublish(
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() body: { branchId: string; revision: number; requestId: string },
  ) {
    const ctx = getRequestContext(request);
    return this.service.unpublish(
      ctx.tenantId!,
      body.branchId,
      id,
      ctx.user!.userId,
      body.requestId,
      body.revision,
    );
  }
}
