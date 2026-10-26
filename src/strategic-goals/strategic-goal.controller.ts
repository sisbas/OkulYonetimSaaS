import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { CreateStrategicGoalDto } from './dto/create-strategic-goal.dto';
import { ListStrategicGoalsQueryDto } from './dto/list-strategic-goals-query.dto';
import { UpdateStrategicGoalDto } from './dto/update-strategic-goal.dto';
import { StrategicGoalService } from './strategic-goal.service';

/**
 * #457 — Stratejik hedef yüzeyi.
 *
 * Kimlik doğrulama (JWT) + kiracı sınırı sınıf düzeyinde; yetki her route'ta
 * literal @Permissions ile zorunlu kılınır. Yetki limiti iki anahtardır:
 * `strategic_goal:manage` (yöneticiler yazar) ve `strategic_goal:read`
 * (öğretmenler okur). Veli bu kaynakları hiç göremez — seed'de veliye
 * hiçbir strategic_goal anahtarı verilmez ve policy engine'de explicit red.
 */
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('strategic-goals')
export class StrategicGoalController {
  constructor(private readonly service: StrategicGoalService) {}

  @Post()
  @Permissions('strategic_goal:manage')
  create(@Req() request: RequestWithContext, @Body() dto: CreateStrategicGoalDto) {
    return this.service.create(request.context!, dto);
  }

  @Get()
  @Permissions('strategic_goal:read')
  list(@Req() request: RequestWithContext, @Query() query: ListStrategicGoalsQueryDto) {
    return this.service.list(request.context!, query);
  }

  @Get(':id')
  @Permissions('strategic_goal:read')
  get(@Req() request: RequestWithContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(request.context!, id);
  }

  @Patch(':id')
  @Permissions('strategic_goal:manage')
  update(
    @Req() request: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStrategicGoalDto,
  ) {
    return this.service.update(request.context!, id, dto);
  }

  @Delete(':id')
  @Permissions('strategic_goal:manage')
  delete(@Req() request: RequestWithContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(request.context!, id);
  }
}
