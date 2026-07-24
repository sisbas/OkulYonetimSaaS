import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import { AuditAction } from '../common/decorators/audit-action.decorator';
import { RequestWithContext } from '../common/context/request-context';
import { AuthService } from './auth.service';

const FORBIDDEN_LOGIN_AUTHORITY_FIELDS = [
  'userId',
  'roles',
  'roleIds',
  'permissions',
  'permissionIds',
  'teacherId',
  'tenant_id',
] as const;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @AuditAction({ action: 'auth.login', resource: 'auth' })
  async login(@Body() body: { email: string; password: string; tenantId?: string }, @Req() req?: RequestWithContext) {
    for (const field of FORBIDDEN_LOGIN_AUTHORITY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        throw new BadRequestException('Login body cannot include authority claims');
      }
    }
    return this.auth.login({
      email: body.email,
      password: body.password,
      tenantId: body.tenantId,
      requestId: req?.context?.requestId,
    });
  }

  @Post('refresh')
  @AuditAction({ action: 'auth.refresh', resource: 'auth' })
  refresh(@Body() _body: { refreshToken: string }) {
    return { status: 'rotation-endpoint-placeholder' };
  }
}
