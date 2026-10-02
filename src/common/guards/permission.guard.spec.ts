import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityAuditService } from '../audit/security-audit.service';
import { AuthorizationContextError } from '../context/authorization-context';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionGuard } from './permission.guard';

class ProbeController {}
class HealthController {}
class AttendanceSessionController {}

function auditMock(): jest.Mocked<Pick<SecurityAuditService, 'emitAuthorizationDenied'>> {
  return { emitAuthorizationDenied: jest.fn() };
}

type GuardHarness = {
  guard: PermissionGuard;
  audit: ReturnType<typeof auditMock>;
  resolve: jest.Mock;
  resolveSelection: jest.Mock;
  sessionContext: jest.Mock;
};

function harness(options: {
  permissions?: string[] | undefined;
  contextScoped?: boolean;
  authority?: { roles: string[]; permissions: string[] } | Error;
}): GuardHarness {
  const audit = auditMock();
  const authority = options.authority instanceof Error ? undefined : options.authority;
  const resolve = jest.fn();
  if (options.authority instanceof Error) resolve.mockRejectedValue(options.authority);
  else
    resolve.mockResolvedValue({
      roles: authority?.roles ?? ['teacher'],
      permissions: authority?.permissions ?? options.permissions ?? [],
      tokenVersion: 1,
      resolvedAt: '2026-09-23T00:00:00.000Z',
      cache: 'miss',
    });
  const resolveSelection = jest.fn();
  const sessionContext = jest.fn().mockResolvedValue({
    accessible: [{ branchId: 'branch-a', name: 'Branch A', code: 'A' }],
    branch: { branchId: 'branch-a', branchName: 'Branch A', source: 'membership_default' },
    authority: {
      roles: authority?.roles ?? ['teacher'],
      permissions: authority?.permissions ?? options.permissions ?? [],
      tokenVersion: 1,
      resolvedAt: '2026-09-23T00:00:00.000Z',
      cache: 'disabled',
    },
  });
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === PERMISSIONS_KEY ? options.permissions : options.contextScoped === true,
    ),
  } as unknown as Reflector;
  const guard = new PermissionGuard(
    reflector,
    audit as unknown as SecurityAuditService,
    { resolve } as never,
    { resolveSelection, sessionContext } as never,
  );
  return { guard, audit, resolve, resolveSelection, sessionContext };
}

function executionContext(
  request: Record<string, unknown>,
  controller: unknown = ProbeController,
  handler: unknown = protectedHandler,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** Test handler'ları: public allowlist handler kimliğiyle eşleşme için adlı olmalı. */
function protectedHandler() {}
// Adı `check` olmalı: HealthController.check public allowlist girdisiyle eşleşir.
function check() {}

const authenticatedUser = (permissions: string[], overrides: Record<string, unknown> = {}) => ({
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant_a',
  roleIds: ['teacher'],
  permissions,
  authorizationVersion: 1,
  ...overrides,
});

describe('PermissionGuard', () => {
  const request = (permissions: string[]) => ({
    user: authenticatedUser(permissions),
    header: jest.fn((name: string) => (name === 'x-request-id' ? 'req-test' : undefined)),
  });

  it('denies missing route permission and emits authorization.denied', async () => {
    const { guard, audit } = harness({
      permissions: ['user:read'],
      authority: { roles: ['teacher'], permissions: [] },
    });
    const context = executionContext(request([]));

    await expect(Promise.resolve(guard.canActivate(context))).resolves.toBe(false);
    expect(audit.emitAuthorizationDenied).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_a' }),
      { requiredPermission: ['user:read'], resource: 'user', reasonCode: 'missing_permission' },
    );
  });

  it('allows matching route permission (server-resolved authority)', async () => {
    const { guard, audit } = harness({
      permissions: ['user:read'],
      authority: { roles: ['tenant_admin'], permissions: ['user:read'] },
    });
    const context = executionContext(request(['user:read']));

    await expect(Promise.resolve(guard.canActivate(context))).resolves.toBe(true);
    expect(audit.emitAuthorizationDenied).not.toHaveBeenCalled();
  });

  it('[default-deny] denies a protected route with no access declaration', async () => {
    const { guard } = harness({ permissions: undefined, contextScoped: false });
    await expect(Promise.resolve(guard.canActivate(executionContext(request(['user:read']))))).resolves.toBe(false);
  });

  it('[default-deny] denies when there is no authenticated context', async () => {
    const { guard } = harness({ permissions: ['user:read'] });
    const anonymous = { header: jest.fn(), user: undefined };
    await expect(Promise.resolve(guard.canActivate(executionContext(anonymous)))).resolves.toBe(false);
  });

  it('[default-deny] denies when the server cannot resolve authority (fail-closed)', async () => {
    const { guard } = harness({
      permissions: ['user:read'],
      authority: new AuthorizationContextError('unresolved_authority'),
    });
    // #339 review P2: 401'e eşlenen bağlam hatası artık EŞLENMİŞ istisnayı
    // fırlatır (Nest'in genel 403'ü non-enumerating sözleşmeyle çelişirdi).
    await expect(
      Promise.resolve(guard.canActivate(executionContext(request(['user:read'])))),
    ).rejects.toMatchObject({ status: 401, message: 'Oturum bağlamı doğrulanamadı' });
  });

  it('rejects a client-supplied tenant header that does not match the token tenant', async () => {
    const { guard, audit } = harness({ permissions: ['user:read'] });
    const mismatched = {
      user: authenticatedUser(['user:read']),
      header: jest.fn((name: string) => (name === 'x-tenant-id' ? 'tenant_b' : undefined)),
    };
    await expect(Promise.resolve(guard.canActivate(executionContext(mismatched)))).resolves.toBe(false);
    expect(audit.emitAuthorizationDenied).toHaveBeenCalledWith(expect.anything(), {
      requiredPermission: ['user:read'],
      resource: 'user',
      reasonCode: 'tenant_header_mismatch',
    });
  });

  it('client-claimed permissions do not grant access (authority is server-resolved)', async () => {
    const { guard } = harness({
      permissions: ['user:read'],
      authority: { roles: ['teacher'], permissions: [] },
    });
    const claimed = {
      user: authenticatedUser(['user:read'], { permissions: ['user:read', 'tenant:branch:read'] }),
      header: jest.fn(),
    };
    await expect(Promise.resolve(guard.canActivate(executionContext(claimed)))).resolves.toBe(false);
  });

  it('denies a client-supplied branch selection outside the server-side branch scope', async () => {
    const { guard, resolveSelection } = harness({ permissions: ['user:read'] });
    resolveSelection.mockRejectedValue(new AuthorizationContextError('unauthorized_branch'));
    const withBranch = {
      user: authenticatedUser(['user:read']),
      header: jest.fn((name: string) =>
        name === 'x-branch-id' ? '22222222-2222-4222-8222-222222222222' : undefined,
      ),
    };
    // Cross-branch/unknown şube: fail-closed (404 kanıtı için test/rbac negatif matrisi).
    await expect(
      Promise.resolve(guard.canActivate(executionContext(withBranch))),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Kayıt bulunamadı',
    });
    expect(resolveSelection).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_a' }),
      { branchId: '22222222-2222-4222-8222-222222222222' },
    );
  });

  it('checks body schedule events against the selected attendance branch', async () => {
    const scheduleEventId = '22222222-2222-4222-8222-222222222222';
    const { guard, sessionContext } = harness({
      permissions: ['attendance:generate'],
      authority: { roles: ['tenant_admin'], permissions: ['attendance:generate'] },
    });
    sessionContext.mockImplementation(async (_user: unknown, options: { resources?: Array<{ id: string }> }) => {
      if (options.resources?.some((resource) => resource.id === scheduleEventId)) {
        throw new AuthorizationContextError('unauthorized_branch');
      }
      return {
        accessible: [{ branchId: 'branch-a', name: 'Branch A', code: 'A' }],
        branch: { branchId: 'branch-a', branchName: 'Branch A', source: 'request_selection' },
        authority: {
          roles: ['tenant_admin'], permissions: ['attendance:generate'],
          tokenVersion: 1, resolvedAt: '2026-09-23T00:00:00.000Z', cache: 'disabled',
        },
      };
    });
    const denied = {
      ...request(['attendance:generate']),
      user: authenticatedUser(['attendance:generate'], { sessionId: 'session-a' }),
      params: {},
      body: { scheduleEventId },
      query: {},
      method: 'POST',
    };

    await expect(Promise.resolve(
      guard.canActivate(executionContext(denied, AttendanceSessionController)),
    )).rejects.toMatchObject({ status: 404 });
    expect(sessionContext).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      resources: [{ table: 'schedule_events', id: scheduleEventId }],
    }));
  });

  it('allows @ContextScoped routes with a resolved context and no business permission', async () => {
    const { guard, resolveSelection } = harness({ permissions: undefined, contextScoped: true });
    await expect(Promise.resolve(guard.canActivate(executionContext(request([]))))).resolves.toBe(true);
    expect(resolveSelection).not.toHaveBeenCalled();
  });

  it('fails closed by default on a resolver infrastructure error; session fallback only when explicitly enabled (non-production)', async () => {
    // Altyapı hatası senaryosu: sunucu-çözümlü oturum yetkisi kullanılır, istemci beyanı yine yetki vermez.
    // #339 F1 (ORCH kararı): VARSAYILAN FAIL-CLOSED'dir. Bayrak yoksa altyapı
    // hatası yetki kararı ÜRETMEZ; production'da fallback tümüyle kapalıdır.
    const previousNodeEnv = process.env.NODE_ENV;
    const previousFallback = process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
    delete process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
    process.env.NODE_ENV = 'production';

    const deniedInProduction = harness({
      permissions: ['user:read'],
      authority: new Error('driver not connected'),
    });
    await expect(
      Promise.resolve(deniedInProduction.guard.canActivate(executionContext(request(['user:read'])))),
    ).resolves.toBe(false);

    // Gürültülü oturum-fallback'i YALNIZ non-production + AÇIK bayrak ile açılır.
    process.env.NODE_ENV = 'test';
    process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = 'true';
    try {
      const allowed = harness({
        permissions: ['user:read'],
        authority: new Error('driver not connected'),
      });
      await expect(
        Promise.resolve(allowed.guard.canActivate(executionContext(request(['user:read'])))),
      ).resolves.toBe(true);

      const insufficient = harness({
        permissions: ['tenant:branch:read'],
        authority: new Error('driver not connected'),
      });
      await expect(
        Promise.resolve(insufficient.guard.canActivate(executionContext(request(['user:read'])))),
      ).resolves.toBe(false);
    } finally {
      if (previousFallback === undefined) delete process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
      else process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = previousFallback;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('keeps public routes reachable without permissions metadata', async () => {
    const { guard, resolve } = harness({ permissions: undefined, contextScoped: false });
    const anonymous = { header: jest.fn(), user: undefined };
    await expect(Promise.resolve(
      guard.canActivate(
        executionContext(anonymous, HealthController, check),
      ),
    )).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });
});
