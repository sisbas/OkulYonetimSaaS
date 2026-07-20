import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { ListTimeSlotsQueryDto } from './dto/list-time-slots-query.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';
import { TimeSlotService } from './time-slot.service';

function requestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) throw new UnauthorizedException('Authentication required');
  if (!request.context?.tenantId) throw new ForbiddenException('Tenant context required');
  return request.context;
}

@UseGuards(AuthGuard('jwt'))
@Controller('time-slots')
export class TimeSlotController {
  constructor(private readonly slots: TimeSlotService) {}

  @Get()
  @Permissions('time_slot:read')
  list(@Req() request: RequestWithContext, @Query() query: ListTimeSlotsQueryDto) {
    return this.slots.list(requestContext(request), query);
  }

  @Get('calendar')
  @Permissions('time_slot:calendar:read')
  calendar(@Req() request: RequestWithContext, @Query() query: ListTimeSlotsQueryDto) {
    return this.slots.calendar(requestContext(request), query);
  }

  @Get(':id')
  @Permissions('time_slot:read')
  get(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.slots.get(requestContext(request), id);
  }

  @Post()
  @Permissions('time_slot:create')
  create(@Req() request: RequestWithContext, @Body() dto: CreateTimeSlotDto) {
    return this.slots.create(requestContext(request), dto);
  }

  @Patch(':id')
  @Permissions('time_slot:update')
  update(
    @Req() request: RequestWithContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateTimeSlotDto,
  ) {
    return this.slots.update(requestContext(request), id, dto);
  }

  @Post(':id/archive')
  @Permissions('time_slot:delete')
  archive(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.slots.archive(requestContext(request), id);
  }

  @Post(':id/reactivate')
  @Permissions('time_slot:update')
  reactivate(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.slots.reactivate(requestContext(request), id);
  }
}
