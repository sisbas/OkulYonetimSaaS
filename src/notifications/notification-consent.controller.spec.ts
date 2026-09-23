import 'reflect-metadata';
import { ExecutionContext, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { SecurityAuditService } from '../common/audit/security-audit.service';
import { RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ROLE_PERMISSION_SEED } from '../database/seeds/permissions.seed';
import { ConsentLifecycleService } from '../kvkk/consent-lifecycle.service';
import { NotificationConsentController } from './notification-consent.controller';

/**
 * #266 R5 — Consent yüzeyi sözleşmesi: her route `@Permissions` taşır
 * (global `PermissionGuard` metadata yoksa fail-OPEN), kiracı yalnız sunucu
 * context'inden gelir ve teacher rolü bu yüzeye erişemez.
 */
describe('NotificationConsentController (#266 R5)', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';
  const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
  const USER_ID = '33333333-3333-4333-8333-333333333333';

  const service = {
    listStudentConsentStatus: jest.fn(async () => ({ consents: [] })),
    withdrawConsent: jest.fn(async () => ({ outcome: 'revoked' })),
  } as unknown as ConsentLifecycleService;

  const request = (overrides: Partial<RequestWithContext> = {}): RequestWithContext =>
    ({
      header: () => undefined,
      context: { requestId: 'req-r5-2', tenantId: TENANT_ID, userId: USER_ID },
      user: { userId: USER_ID, tenantId: TENANT_ID, roleIds: [], permissions: [] },
      ...overrides,
    }) as unknown as RequestWithContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps each route to seeded permissions (fail-closed contract)', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, NotificationConsentController.prototype.list),
    ).toEqual(['student:kvkk:read']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, NotificationConsentController.prototype.withdraw),
    ).toEqual(['parent_notification:approve']);
  });

  it('gives every routed handler permission metadata', () => {
    const prototype = NotificationConsentController.prototype as unknown as Record<
      string,
      object
    >;
    const handlers = Object.getOwnPropertyNames(NotificationConsentController.prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) => Reflect.getMetadata(PATH_METADATA, prototype[name]) !== undefined);

    expect(handlers.sort()).toEqual(['list', 'withdraw']);
    for (const handler of handlers) {
      const metadata = Reflect.getMetadata(PERMISSIONS_KEY, prototype[handler]);
      expect(Array.isArray(metadata) && metadata.length > 0).toBe(true);
    }
  });

  it('passes the request context tenant to the service and ignores tenant input from the body', async () => {
    const controller = new NotificationConsentController(service);
    await controller.withdraw(
      request(),
      STUDENT_ID,
      { consentType: 'sms_notification', tenantId: OTHER_TENANT_ID } as never,
    );

    expect(service.withdrawConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        studentId: STUDENT_ID,
        consentType: 'sms_notification',
        actor: expect.objectContaining({ actorUserId: USER_ID, requestId: 'req-r5-2' }),
      }),
    );
  });

  it('rejects an out-of-dictionary consent type before calling the service', () => {
    const controller = new NotificationConsentController(service);

    expect(() =>
      controller.withdraw(request(), STUDENT_ID, { consentType: 'marketing_sms' }),
    ).toThrow(BadRequestException);
    expect(service.withdrawConsent).not.toHaveBeenCalled();
  });

  it('fails closed without an authenticated user or tenant context', () => {
    const controller = new NotificationConsentController(service);

    expect(() =>
      controller.list(
        {
          header: () => undefined,
          context: { requestId: 'req-1' },
        } as unknown as RequestWithContext,
        STUDENT_ID,
      ),
    ).toThrow(UnauthorizedException);

    expect(() =>
      controller.list(
        {
          header: () => undefined,
          user: { userId: USER_ID, tenantId: TENANT_ID, roleIds: [], permissions: [] },
          context: { requestId: 'req-1' },
        } as unknown as RequestWithContext,
        STUDENT_ID,
      ),
    ).toThrow(ForbiddenException);
  });
  describe('teacher cannot reach the surface (KVKK)', () => {
    function guardContext(permissions: readonly string[]): ExecutionContext {
      return {
        getClass: jest.fn(),
        getHandler: jest.fn(),
        switchToHttp: () => ({
          getRequest: () =>
            request({
              user: {
                userId: USER_ID,
                tenantId: TENANT_ID,
                roleIds: [],
                permissions: [...permissions],
              },
            }),
        }),
      } as unknown as ExecutionContext;
    }

    function guardFor(required: string[]) {
      const reflector = { getAllAndOverride: jest.fn(() => required) } as unknown as Reflector;
      const audit = { emitAuthorizationDenied: jest.fn() } as unknown as SecurityAuditService;
      return { guard: new PermissionGuard(reflector, audit), audit };
    }

    it('denies the seeded teacher permission set on both routes', () => {
      const teacherPermissions = ROLE_PERMISSION_SEED.teacher as readonly string[];
      expect(teacherPermissions).not.toContain('student:kvkk:read');
      expect(teacherPermissions).not.toContain('parent_notification:approve');

      for (const required of [['student:kvkk:read'], ['parent_notification:approve']]) {
        const { guard, audit } = guardFor(required);
        expect(guard.canActivate(guardContext(teacherPermissions))).toBe(false);
        expect(audit.emitAuthorizationDenied).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ requiredPermission: required, reasonCode: 'missing_permission' }),
        );
      }
    });

    it('allows the seeded tenant_admin permission set (surfaces are reachable)', () => {
      const adminPermissions = ROLE_PERMISSION_SEED.tenant_admin as readonly string[];

      for (const required of [['student:kvkk:read'], ['parent_notification:approve']]) {
        const { guard, audit } = guardFor(required);
        expect(guard.canActivate(guardContext(adminPermissions))).toBe(true);
        expect(audit.emitAuthorizationDenied).not.toHaveBeenCalled();
      }
    });
  });
});
