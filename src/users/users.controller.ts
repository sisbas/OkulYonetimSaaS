import { Controller, Get, UseGuards, Query, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RequestWithContext } from '../common/context/request-context';

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  @Get()
  @Permissions('user.read')
  findAll(@Req() req: RequestWithContext, @Query('tenantId') _tenantId?: string) {
    return { tenantId: req.context?.tenantId, data: [] };
  }
}
