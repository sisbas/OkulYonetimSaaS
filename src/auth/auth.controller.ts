import { Body, Controller, Post } from '@nestjs/common';
import { AuditAction } from '../common/decorators/audit-action.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @AuditAction({ action: 'auth.login', resource: 'auth' })
  login(@Body() body: { userId: string; tenantId: string; roles?: string[]; permissions?: string[] }) {
    return this.auth.issueTokenPair({ userId: body.userId, tenantId: body.tenantId, roles: body.roles ?? [], permissions: body.permissions ?? [] });
  }

  @Post('refresh')
  @AuditAction({ action: 'auth.refresh', resource: 'auth' })
  refresh(@Body() _body: { refreshToken: string }) {
    return { status: 'rotation-endpoint-placeholder' };
  }
}
