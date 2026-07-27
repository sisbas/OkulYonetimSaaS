import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { DailyOperationsService } from './daily-operations.service';
import { CreateSubstitutionAssignmentDto } from './dto/create-substitution-assignment.dto';

function getRequestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) throw new UnauthorizedException('Authentication required');
  if (!request.context?.tenantId) throw new ForbiddenException('Tenant context required');
  return request.context;
}

@Controller('daily-operations/leaves')
export class DailyOperationsController {
  constructor(private readonly dailyOperations: DailyOperationsService) {}

  @Get(':leaveId/impact')
  @Permissions('leave:impact:read')
  impact(@Req() request: RequestWithContext, @Param('leaveId', ParseUUIDPipe) leaveId: string) {
    return this.dailyOperations.impact(getRequestContext(request), leaveId);
  }

  @Get(':leaveId/events/:scheduleEventId/candidates')
  @Permissions('leave:impact:read')
  candidates(
    @Req() request: RequestWithContext,
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
    @Param('scheduleEventId', ParseUUIDPipe) scheduleEventId: string,
  ) {
    return this.dailyOperations.candidates(getRequestContext(request), leaveId, scheduleEventId);
  }

  @Post(':leaveId/events/:scheduleEventId/substitution')
  @Permissions('daily_operations:update')
  assign(
    @Req() request: RequestWithContext,
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
    @Param('scheduleEventId', ParseUUIDPipe) scheduleEventId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: CreateSubstitutionAssignmentDto,
  ) {
    return this.dailyOperations.assign(getRequestContext(request), leaveId, scheduleEventId, dto, ifMatch);
  }

  @Delete(':leaveId/events/:scheduleEventId/substitution')
  @Permissions('daily_operations:update')
  clear(
    @Req() request: RequestWithContext,
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
    @Param('scheduleEventId', ParseUUIDPipe) scheduleEventId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.dailyOperations.clear(getRequestContext(request), leaveId, scheduleEventId, ifMatch);
  }

  @Post(':leaveId/projection/replay')
  @Permissions('daily_operations:update')
  replayProjection(@Req() request: RequestWithContext, @Param('leaveId', ParseUUIDPipe) leaveId: string) {
    return this.dailyOperations.replayProjection(getRequestContext(request), leaveId);
  }
}
