import { BadRequestException, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';

import { AuthorizationContextError } from '../../src/common/context/authorization-context';
import { decideDeny } from '../../src/common/context/deny-response';
import { RequestContext } from '../../src/common/context/request-context';
import { ContextCatalogController } from '../../src/rbac/context-catalog.controller';
import { ContextBranchSelectDto } from '../../src/rbac/dto/context-branch-select.dto';

/**
 * Negatif matris (#339 R4, AC b/c/d): sunucu-tek-kaynak bağlam sözleşmesi.
 *
 * Bu dosya istemcinin gönderdiği tenant/şube/rol/izin değerlerinin yetki
 * ÜRETEMEDİĞİNİ ve hata yanıtlarının 403/404 ayrımıyla kaynak varlığını
 * sızdırmadığını endpoint düzeyinde doğrular.
 */
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_A = '33333333-3333-4333-8333-333333333333';

const context = (overrides: Partial<RequestContext> = {}): RequestContext => ({
  requestId: 'req-1',
  contextVersion: 'context:v2',
  tenantId: TENANT_A,
  userId: '55555555-5555-4555-8555-555555555555',
  roles: ['operations_manager'],
  permissions: ['tenant:branch:read'],
  activeRole: 'operations_manager',
  ...overrides,
});

const controller = (options: { branches?: unknown[]; reject?: Error } = {}) => {
  const catalog = {
    build: options.reject
      ? jest.fn().mockRejectedValue(options.reject)
      : jest.fn().mockResolvedValue({
          version: 'context-catalog:v1',
          institution: { name: 'Atatürk Ortaokulu' },
          role: { key: 'operations_manager', label: 'Operasyon Yöneticisi' },
          branches: options.branches ?? [{ name: 'Merkez Kampüs' }],
          activeBranch: { name: 'Merkez Kampüs' },
        }),
  };
  return {
    controller: new ContextCatalogController(catalog as never),
    catalog,
  };
};

describe('client-supplied authority values cannot grant access', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

  it('rejects tenant/branch/role/permission claims in the branch selection body', async () => {
    await expect(
      pipe.transform(
        { branchName: 'Merkez Kampüs', tenantId: 'other', roles: ['tenant_admin'], permissions: ['*'] },
        { type: 'body', metatype: ContextBranchSelectDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only the branch name (whitelisted contract)', async () => {
    await expect(
      pipe.transform({ branchName: 'Merkez Kampüs' }, { type: 'body', metatype: ContextBranchSelectDto }),
    ).resolves.toEqual({ branchName: 'Merkez Kampüs' });
  });
});

describe('catalog endpoint error contract (non-enumerating)', () => {
  it('returns the caller-scoped catalog with human-readable names only', async () => {
    const { controller: ctrl, catalog } = controller();
    const response = await ctrl.current({ context: context() } as never);

    expect(catalog.build).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_A }), {});
    expect(JSON.stringify(response)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(JSON.stringify(response)).not.toMatch(/etag|branchId|tenantId|permission/i);
  });

  it('maps an unauthorized/unknown branch selection to a generic 404', async () => {
    const { controller: ctrl } = controller({
      reject: new AuthorizationContextError('unauthorized_branch'),
    });

    await expect(
      ctrl.selectBranch({ context: context() } as never, { branchName: 'Gizli Şube' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctrl.selectBranch({ context: context() } as never, { branchName: 'Gizli Şube' }),
    ).rejects.toMatchObject({
      message: decideDeny('cross_tenant_or_unknown_resource').message,
      status: 404,
    });
  });

  it('maps an unresolvable context to a generic 401 without resource details', async () => {
    const { controller: ctrl } = controller({
      reject: new AuthorizationContextError('missing_tenant_scope'),
    });

    await expect(
      ctrl.current({ context: context({ tenantId: undefined }) } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      ctrl.current({ context: context({ tenantId: undefined }) } as never),
    ).rejects.toMatchObject({ message: decideDeny('unresolved_context').message, status: 401 });
  });

  it('maps a stale authorization version to a generic 401', async () => {
    const { controller: ctrl } = controller({
      reject: new AuthorizationContextError('stale_authorization_version'),
    });

    await expect(ctrl.current({ context: context() } as never)).rejects.toMatchObject({
      status: 401,
      message: decideDeny('stale_authorization').message,
    });
  });

  it('does not distinguish cross-tenant from cross-branch from unknown branches', async () => {
    const crossTenant = decideDeny('cross_tenant_or_unknown_resource');
    const crossBranch = decideDeny('branch_not_authorized');
    expect(crossTenant).toEqual(crossBranch);
    expect(crossTenant.message).not.toMatch(/tenant|şube|branch|id|var|yok/i);
  });
});
