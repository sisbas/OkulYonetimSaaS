import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomService } from './room.service';

function getRequestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) throw new UnauthorizedException('Authentication required');
  if (!request.context?.tenantId) throw new ForbiddenException('Tenant context required');
  return request.context;
}

@UseGuards(AuthGuard('jwt'))
@Controller('rooms')
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @Post()
  @Permissions('room:create')
  create(@Req() request: RequestWithContext, @Body() dto: CreateRoomDto) {
    return this.rooms.create(getRequestContext(request), dto);
  }

  @Get()
  @Permissions('room:read')
  list(@Req() request: RequestWithContext, @Query() query: ListRoomsQueryDto) {
    return this.rooms.list(getRequestContext(request), query);
  }

  @Get(':id')
  @Permissions('room:read')
  get(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.rooms.get(getRequestContext(request), id);
  }

  @Patch(':id')
  @Permissions('room:update')
  update(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(getRequestContext(request), id, dto);
  }

  @Delete(':id')
  @Permissions('room:delete')
  softDelete(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.rooms.deactivate(getRequestContext(request), id);
  }

  @Post(':id/deactivate')
  @Permissions('room:archive')
  deactivate(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.rooms.deactivate(getRequestContext(request), id);
  }

  @Post(':id/reactivate')
  @Permissions('room:archive')
  reactivate(@Req() request: RequestWithContext, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.rooms.reactivate(getRequestContext(request), id);
  }
}
