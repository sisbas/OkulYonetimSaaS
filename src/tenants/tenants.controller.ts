import { Controller, Get, UseGuards, NotFoundException, Param, Req } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RequestWithContext } from '../common/context/request-context';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';

// Kiracı kapsamı zorunlu: isteğin sınırında kiracı izolasyonunu doğrular.
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('tenants')
export class TenantsController {
  @Get(':tenantId')
  @Permissions('tenant:read')
  findOne(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    if (req.context?.tenantId !== tenantId) throw new NotFoundException();
    return { id: tenantId };
  }
}
