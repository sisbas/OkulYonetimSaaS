import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { ScheduleService } from './schedule.service';
import {
  CreateScheduleInput,
  SaveDraftInput,
} from './schedule.service';
import { ScheduleEventDraft } from './m3-schedule-contract';

// Basit request shape'leri (gerçek auth context'ten tenant/actor alınır).
type ReqCtx = { tenantId: string; actorId: string };

@Controller('schedules')
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Post()
  async create(@Body() body: CreateScheduleInput & ReqCtx) {
    return this.service.createSchedule({
      tenantId: body.tenantId,
      branchId: body.branchId,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null,
    });
  }

  @Post(':id/draft')
  async saveDraft(
    @Param('id') id: string,
    @Body() body: { events: ScheduleEventDraft[]; branchId: string } & ReqCtx,
  ) {
    if (!body.tenantId) throw new ForbiddenException('tenant resolution failed');
    const input: SaveDraftInput = {
      tenantId: body.tenantId,
      branchId: body.branchId,
      scheduleId: id,
      events: body.events,
    };
    return this.service.saveDraft(input);
  }

  @Post(':id/validate')
  async validate(
    @Param('id') id: string,
    @Body()
    body: {
      events: ScheduleEventDraft[];
      branchId: string;
      revision: number;
    } & ReqCtx,
  ) {
    return this.service.validateDraft(
      body.tenantId,
      body.branchId,
      id,
      body.events,
      body.revision,
    );
  }

  @Post(':id/publish')
  async publish(
    @Param('id') id: string,
    @Body()
    body: {
      events: import('./m3-schedule-contract').ScheduleEventDraft[];
      branchId: string;
      revision: number;
      requestId: string;
    } & ReqCtx,
  ) {
    return this.service.publish(
      body.tenantId,
      body.branchId,
      id,
      body.actorId,
      body.requestId,
      body.events,
      body.revision,
    );
  }

  @Post(':id/unpublish')
  async unpublish(
    @Param('id') id: string,
    @Body() body: { branchId: string; revision: number; requestId: string } & ReqCtx,
  ) {
    return this.service.unpublish(
      body.tenantId,
      body.branchId,
      id,
      body.actorId,
      body.requestId,
      body.revision,
    );
  }
}
