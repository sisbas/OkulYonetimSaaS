import { Controller, Get, UseGuards, NotFoundException, Param, Req } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RequestWithContext } from '../common/context/request-context';

@UseGuards(AuthGuard('jwt'))
@Controller('tenants')
export class TenantsController {
  @Get(':tenantId')
  @Permissions('tenant.read')
  findOne(@Param('tenantId') tenantId: string, @Req() req: RequestWithContext) {
    if (req.context?.tenantId !== tenantId) throw new NotFoundException();
    return { id: tenantId };
  }
}
