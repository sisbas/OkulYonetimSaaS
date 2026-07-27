import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { LeaveDecisionStatus } from './leave-request.entity';
import { LeaveService } from './leave.service';

function getRequestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) throw new UnauthorizedException('Authentication required');
  if (!request.context?.tenantId) throw new ForbiddenException('Tenant context required');
  return request.context;
}

@Controller('leaves')
export class LeaveController {
  constructor(private readonly leaves: LeaveService) {}

  @Post('me')
  @Permissions('leave:create')
  createOwn(@Req() request: RequestWithContext, @Body() dto: CreateLeaveRequestDto) {
    return this.leaves.createOwn(getRequestContext(request), dto);
  }

  @Get('me/:id')
  @Permissions('leave:own:read')
  getOwn(@Req() request: RequestWithContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leaves.getOwn(getRequestContext(request), id);
  }

  @Get()
  @Permissions('leave:read')
  list(@Req() request: RequestWithContext, @Query() query: ListLeaveRequestsQueryDto) {
    return this.leaves.listForOperations(getRequestContext(request), query);
  }

  @Get(':id')
  @Permissions('leave:read')
  get(@Req() request: RequestWithContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leaves.getForOperations(getRequestContext(request), id);
  }

  @Patch(':id/approve')
  @Permissions('leave:approve')
  approve(
    @Req() request: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.leaves.decide(getRequestContext(request), id, { decision: LeaveDecisionStatus.APPROVED }, ifMatch);
  }

  @Patch(':id/reject')
  @Permissions('leave:reject')
  reject(
    @Req() request: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.leaves.decide(
      getRequestContext(request),
      id,
      { decision: LeaveDecisionStatus.REJECTED },
      ifMatch,
    );
  }
}
