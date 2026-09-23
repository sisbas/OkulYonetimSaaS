import { CanActivate, ExecutionContext, Injectable, Logger, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthorityResolverService } from '../../rbac/authority-resolver.service';
import { BranchScopeService } from '../../rbac/branch-scope.service';
import { SecurityAuditService, resourceFromPermission } from '../audit/security-audit.service';
import {
  AuthorizationContextError,
  ServerResolvedAuthority,
  buildAuthorizedContext,
} from '../context/authorization-context';
import { emitContextAuditEvent, legacySecurityAuditReasonCode } from '../context/context-audit';
import { CONTEXT_SCOPE_KEY } from '../context/context-scope.decorator';
import { DenyReasonCode, denyReasonFromContextFailure } from '../context/deny-response';
import { isPublicRouteHandler } from '../context/public-route';
import { RequestBranch, RequestWithContext } from '../context/request-context';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

const BRANCH_ID_HEADER = 'x-branch-id';

/**
 * Global yetkilendirme guard'ı (#339 R4, madde 2 & 5).
 *
 * Default-deny sözleşmesi (fail-closed):
 *  1. Public allowlist dışındaki her route korumalıdır; erişim sınıfı ya
 *     `@Permissions(...)` ya da açık `@ContextScoped()` beyanıyla belirlenir.
 *     Beyan yoksa erişim REDDEDİLİR (sessiz fail-open yok).
 *  2. Kimliği doğrulanmış kullanıcı yoksa reddedilir.
 *  3. İstemcinin gönderdiği tenant/şube/rol/izin değerleri ASLA yetki kaynağı
 *     değildir: başlıkta gelen tenant token tenant'ıyla uyuşmuyorsa reddedilir,
 *     şube seçimi sunucunun yetkili şube kümesiyle doğrulanır.
 *  4. Efektif izinler sunucudan (`AuthorityResolverService`, token_version
 *     uyumlu) çözülür; token gövdesindeki beyanlar yetki üretmez.
 *  5. Bağlam/izin çözülemezse erişim yoktur (hata → red).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: SecurityAuditService,
    /**
     * Sunucu-tek-kaynak yetki çözümleyici (önbellek + token_version uyumu).
     * Runtime'da daima enjekte edilir (RbacModule tarafından export edilir).
     * Enjekte edilmediği dar durumda (izole birim/controller spec'i) yetki,
     * kimlik doğrulama katmanının SUNUCUDAN çözdüğü `request.user` üzerinden
     * alınır; istemci beyanı hiçbir durumda yetki kaynağı değildir.
     */
    @Optional()
    private readonly authority?: AuthorityResolverService,
    /** Şube kapsamı; enjekte edilmemişse istemci şube seçimi reddedilir. */
    @Optional()
    private readonly branchScope?: BranchScopeService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();
    if (isPublicRouteHandler(controller?.name, handler?.name)) return true;

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      handler,
      controller,
    ]);
    const requiredPermission = required ?? [];
    const contextScoped =
      this.reflector.getAllAndOverride<boolean>(CONTEXT_SCOPE_KEY, [handler, controller]) === true;

    const user = request.user;
    if (!user?.userId || !user.tenantId) {
      return this.deny(request, 'missing_authenticated_context', requiredPermission);
    }

    const headerTenantId = request.header?.('x-tenant-id') ?? undefined;
    if (headerTenantId && headerTenantId !== user.tenantId) {
      request.context = {
        ...this.baseContext(request),
        tenantId: user.tenantId,
        userId: user.userId,
        user,
      };
      return this.deny(request, 'client_authority_rejected', requiredPermission);
    }

    if (requiredPermission.length === 0 && !contextScoped) {
      // Beyan edilmemiş korumalı route → default-deny.
      return this.deny(request, 'undeclared_protected_route', requiredPermission);
    }

    const branchIdHeader = request.header?.(BRANCH_ID_HEADER) ?? undefined;

    // Tamamen senkron yol: yetki çözümleyici enjekte edilmemiş ve istemci şube
    // seçimi yoksa (izole birim spec'leri / DI'siz kullanım) karar senkron
    // verilir; yetki yine kimlik katmanının sunucudan çözdüğü `request.user`dır.
    if (!this.authority && !branchIdHeader) {
      return this.settle(request, user, this.sessionAuthority(user), null, requiredPermission);
    }
    if (branchIdHeader && !this.branchScope) {
      // Şube kapsamı doğrulanamıyorsa istemci seçimi kabul edilmez (fail-closed).
      return this.deny(request, 'branch_not_authorized', requiredPermission);
    }
    return this.resolveAndSettle(request, user, branchIdHeader, requiredPermission);
  }

  /** Yetki çözümleyici ile (önbellekli, token_version uyumlu) karar yolu. */
  private async resolveAndSettle(
    request: RequestWithContext,
    user: NonNullable<RequestWithContext['user']>,
    branchIdHeader: string | undefined,
    requiredPermission: ReadonlyArray<string>,
  ): Promise<boolean> {
    try {
      const resolvedAuthority: ServerResolvedAuthority = this.authority
        ? await this.authority.resolve({
            userId: user.userId,
            tenantId: user.tenantId,
            tokenVersion: Number(user.authorizationVersion ?? 0),
          })
        : this.sessionAuthority(user);
      const branch =
        branchIdHeader && this.branchScope
          ? await this.branchScope.resolveSelection(
              {
                tenantId: user.tenantId,
                userId: user.userId,
                roles: resolvedAuthority.roles as string[],
                permissions: resolvedAuthority.permissions as string[],
              },
              { branchId: branchIdHeader },
            )
          : null;
      return this.settle(request, user, resolvedAuthority, branch, requiredPermission);
    } catch (error) {
      if (error instanceof AuthorizationContextError) {
        return this.deny(
          request,
          denyReasonFromContextFailure(error.reasonCode),
          requiredPermission,
        );
      }
      throw error;
    }
  }

  /**
   * Kimlik katmanının sunucudan çözdüğü yetki (fallback). `request.user`
   * JWT doğrulaması + DB oturum/token_version kontrolünden geçmiş veridir;
   * istemci beyanı değildir.
   */
  private sessionAuthority(user: NonNullable<RequestWithContext['user']>): ServerResolvedAuthority {
    return {
      roles: user.roleIds,
      permissions: user.permissions,
      tokenVersion: Number(user.authorizationVersion ?? 0),
      resolvedAt: new Date().toISOString(),
      cache: 'disabled',
    };
  }

  /** Bağlamı kurar ve yetki kararını verir (fail-closed). */
  private settle(
    request: RequestWithContext,
    user: NonNullable<RequestWithContext['user']>,
    authority: ServerResolvedAuthority,
    branch: RequestBranch | null,
    requiredPermission: ReadonlyArray<string>,
  ): boolean {
    try {
      request.context = buildAuthorizedContext({
        requestId: this.baseContext(request).requestId,
        user,
        authority,
        branch,
      });
    } catch (error) {
      if (error instanceof AuthorizationContextError) {
        return this.deny(request, denyReasonFromContextFailure(error.reasonCode), requiredPermission);
      }
      throw error;
    }

    // `@ContextScoped()` route'ları yalnızca bağlam gerektirir (iş izni yok).
    if (requiredPermission.length === 0) return true;

    const effective = request.context?.permissions ?? [];
    if (!requiredPermission.every((permission) => effective.includes(permission))) {
      return this.deny(request, 'missing_permission', requiredPermission);
    }
    return true;
  }

  private baseContext(request: RequestWithContext) {
    return request.context ?? { requestId: request.header?.('x-request-id') ?? 'unknown' };
  }

  /**
   * Reddi kaydeder ve `false` döner. Mevcut güvenlik audit kanalı yalnızca
   * desteklediği sebep kodları için çağrılır; diğer kodlar allowlist tabanlı
   * redakte edilmiş bağlam olayıyla kaydedilir (tek olay/red).
   */
  private deny(
    request: RequestWithContext,
    reasonCode: DenyReasonCode,
    requiredPermission: ReadonlyArray<string>,
  ): false {
    const legacy = legacySecurityAuditReasonCode(reasonCode);
    if (legacy) {
      this.audit.emitAuthorizationDenied(request.context, {
        requiredPermission: [...requiredPermission],
        resource: resourceFromPermission(requiredPermission[0] ?? 'unknown'),
        reasonCode: legacy,
      });
    } else {
      emitContextAuditEvent(this.logger, {
        reasonCode,
        context: request.context,
        requiredPermission,
        resource: resourceFromPermission(requiredPermission[0] ?? 'unknown'),
        branchScoped: reasonCode === 'branch_not_authorized',
      });
    }
    return false;
  }
}
