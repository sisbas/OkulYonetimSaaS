import 'reflect-metadata';

import { buildAuthorizedContext } from '../common/context/authorization-context';
import { RequestContext, RequestUser, RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationOperationsController } from './notification-operations.controller';

/**
 * #462 — Receipt görünürlüğü yalnızca sunucu-çözülmüş yetkiden karar verir.
 *
 * Detay yanıtında teslimat receipt'leri koşullu eklenir. Bu karar
 * `PermissionGuard`'ın kullandığı ALANLA (`context.permissions`) verilmelidir.
 * `req.user.permissions` JWT beyanıdır, oturum boyunca yeniden çözülmez; rol
 * yetkiyi kaybettikten sonra bile token'da kalır ve kaldırılmış yetkiyi geri
 * kazandırırdı.
 */
describe('NotificationOperationsController receipt visibility', () => {
  const RECEIPT_PERMISSION = 'parent_notification:failure:read';
  const DETAIL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const TOKEN_VERSION = 4;

  const service = {
    detail: jest.fn(),
  } as unknown as jest.Mocked<NotificationDispatchService>;

  const controller = new NotificationOperationsController(service);

  beforeEach(() => {
    service.detail.mockReset();
    service.detail.mockResolvedValue({ receipts: [] } as never);
  });

  /**
   * Sunucu çözümlemesinin ürettiği gerçek bağlam: `permissions` ile
   * `authorization.permissions` aynı diziden gelir. `tokenPermissions`
   * resolver'ın (veritabanı/cache) döndürdüğü etkin yetki kümesidir.
   */
  function serverContext(tokenPermissions: string[]): RequestContext {
    return buildAuthorizedContext({
      requestId: 'req-1',
      user: tokenUser(),
      authority: {
        roles: ['operations_manager'],
        permissions: tokenPermissions,
        tokenVersion: TOKEN_VERSION,
        resolvedAt: '2026-10-15T00:00:00.000Z',
        cache: 'hit',
      },
      branch: { branchId: 'branch-a', branchName: 'Merkez', source: 'membership_default' },
    });
  }

  /** JWT'den gelen kullanıcı — `permissions` burada token beyanıdır. */
  function tokenUser(overrides: Partial<RequestUser> = {}): RequestUser {
    return {
      userId: 'user-1',
      tenantId: 'tenant-a',
      roleIds: ['operations_manager'],
      permissions: [RECEIPT_PERMISSION],
      authorizationVersion: TOKEN_VERSION,
      ...overrides,
    };
  }

  function requestFor(context: RequestContext): RequestWithContext {
    return { context, user: tokenUser() } as unknown as RequestWithContext;
  }

  function includeReceiptsFor(req: RequestWithContext): boolean | undefined {
    void controller.detail(req, DETAIL_ID);
    return service.detail.mock.calls[0]?.[2] as boolean | undefined;
  }

  it('includes receipts when the server-resolved context carries the permission', () => {
    expect(includeReceiptsFor(requestFor(serverContext([RECEIPT_PERMISSION])))).toBe(true);
  });

  it('withholds receipts when the permission is absent from the server-resolved context', () => {
    expect(includeReceiptsFor(requestFor(serverContext([])))).toBe(false);
  });

  /**
   * Çekirdek regresyon (#462): rol yetkiyi kaybetti, sunucu çözümlemesi yetkiyi
   * düşürdü — ama token hâlâ eski yetkiyi taşıyor. Token beyanı yetki
   * üretmez, receipt dönmemeli.
   */
  it('does not let a stale token claim re-admit a revoked receipt permission', () => {
    // Token, yetkiyi İÇERİYOR; sunucu çözümlemesi yetkiyi İÇERMİYOR.
    const req = requestFor(serverContext([]));

    expect(req.user?.permissions).toContain(RECEIPT_PERMISSION);
    expect(req.context?.permissions).not.toContain(RECEIPT_PERMISSION);
    expect(includeReceiptsFor(req)).toBe(false);
  });

  it('maps every route to its seeded permission, leaving route gates untouched', () => {
    const proto = NotificationOperationsController.prototype;

    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.list)).toEqual(['notification:draft:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.detail)).toEqual(['notification:draft:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.execute)).toEqual(['parent_notification:send']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.retry)).toEqual(['parent_notification:send']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.cancel)).toEqual(['parent_notification:approve']);
  });
});