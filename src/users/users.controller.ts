import { Controller, Get, UseGuards, Query, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RequestWithContext } from '../common/context/request-context';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';

// Kiracı kapsamı zorunlu: TenantScopeGuard, AuthGuard('jwt') sonrası isteğin
// sınırında kiracı izolasyonunu (UUID formatı, header/token çakışması) doğrular.
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('users')
export class UsersController {
  @Get()
  @Permissions('user:read')
  findAll(@Req() req: RequestWithContext, @Query('tenantId') _tenantId?: string) {
    return { tenantId: req.context?.tenantId, data: [] };
  }
}
