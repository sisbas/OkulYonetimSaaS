import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

import { isPublicRouteHandler } from '../context/public-route';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Kimlik doğrulama kapısı (APP_GUARD #1) — #339 R4 default-deny.
 *
 * Kural: public allowlist DIŞINDAKİ her route kimlik doğrulaması ister.
 * Önceki davranış (`@Permissions` metadata'sı yoksa kimlik doğrulamayı atla)
 * sessiz bir fail-open kapısıydı: metadata taşımayan korumalı bir route hem
 * JWT doğrulamasından hem yetki kontrolünden geçmiyordu. Artık metadata'sız
 * korumalı route'lar da doğrulanır; yetki kararı `PermissionGuard`'da
 * default-deny olarak verilir.
 *
 * Savunma katmanı: `@Permissions` metadata'sı taşıyan bir route public
 * allowlist'e yanlışlıkla eklenmiş olsa bile kimlik doğrulaması ATLANMAZ.
 *
 * Bu guard `PermissionGuard`'dan ÖNCE kayıtlıdır (mevcut sıralama korunur).
 */
@Injectable()
export class PermissionAuthenticationGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const controller = context.getClass();
    const handler = context.getHandler();
    if (isPublicRouteHandler(controller?.name, handler?.name)) {
      const declaresPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        handler,
        controller,
      ]);
      // Çelişkili beyan (public + @Permissions) fail-closed: doğrulama zorunlu.
      if (!declaresPermissions?.length) return true;
    }
    return super.canActivate(context);
  }
}

