import { Controller, Get, UseGuards } from '@nestjs/common';
import { PERMISSION_SEED } from '../database/seeds/permissions.seed';
import { ROLE_SEED } from '../database/seeds/roles.seed';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(AuthGuard('jwt'))
@Controller('rbac')
export class RbacController {
  @Get('permissions')
  @Permissions('role:permission:read')
  permissions() { return PERMISSION_SEED; }

  @Get('roles')
  @Permissions('role:read')
  roles() { return ROLE_SEED; }
}
