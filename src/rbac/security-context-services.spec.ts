import { AuthorizationContextError } from '../common/context/authorization-context';
import { RequestContext } from '../common/context/request-context';
import { AuthorityResolverService } from './authority-resolver.service';
import { BranchScopeService } from './branch-scope.service';
import { CONTEXT_CATALOG_VERSION, ContextCatalogService, roleLabel } from './context-catalog.service';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const BRANCH_A = '33333333-3333-4333-8333-333333333333';
const BRANCH_B = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const authorityRows = [
  { tokenVersion: 3, role: 'operations_manager', permission: 'tenant:branch:read' },
  { tokenVersion: 3, role: 'operations_manager', permission: 'user:read' },
];

describe('AuthorityResolverService (server-side resolution + cache invalidation)', () => {
  const originalTtl = process.env.AUTHORITY_CACHE_TTL_MS;
  afterEach(() => {
    if (originalTtl === undefined) delete process.env.AUTHORITY_CACHE_TTL_MS;
    else process.env.AUTHORITY_CACHE_TTL_MS = originalTtl;
    jest.restoreAllMocks();
  });

  const service = (rows: unknown = authorityRows) => {
    const query = jest.fn().mockResolvedValue(rows);
    return { service: new AuthorityResolverService({ query } as never), query };
  };

  it('resolves the effective authority from the database (tenant-scoped query)', async () => {
    const { service: resolver, query } = service();
    const resolved = await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    expect(resolved.roles).toEqual(['operations_manager']);
    expect(resolved.permissions).toEqual(['tenant:branch:read', 'user:read']);
    expect(resolved.cache).toBe('miss');
    expect(query.mock.calls[0][1]).toEqual([USER_ID, TENANT_A]);
    expect(String(query.mock.calls[0][0])).toContain('tenant_memberships');
  });

  it('serves repeat lookups from the cache (single query) and reports a hit', async () => {
    const { service: resolver, query } = service();
    await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    const second = await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    expect(second.cache).toBe('hit');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('never serves a stale authority after invalidation', async () => {
    const { service: resolver, query } = service();
    await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    expect(resolver.invalidateUser(USER_ID, TENANT_A)).toBe(1);
    const third = await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    expect(third.cache).toBe('miss');
    expect(query).toHaveBeenCalledTimes(2);
    expect(resolver.stats()).toMatchObject({ misses: 2 });
  });

  it('invalidates every tenant entry on a role/permission mutation', async () => {
    const { service: resolver } = service();
    await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    await resolver.resolve({ userId: 'other-user', tenantId: TENANT_A, tokenVersion: 3 });
    await resolver.resolve({ userId: USER_ID, tenantId: TENANT_B, tokenVersion: 3 });
    expect(resolver.invalidateTenant(TENANT_A)).toBe(2);
    expect(resolver.stats().size).toBe(1);
  });

  it('fails closed on a stale token version (token_version invalidation path)', async () => {
    const { service: resolver } = service();
    await expect(
      resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 1 }),
    ).rejects.toBeInstanceOf(AuthorizationContextError);
  });

  it('fails closed when no active membership/user row exists', async () => {
    const { service: resolver } = service([]);
    await expect(
      resolver.resolve({ userId: USER_ID, tenantId: TENANT_B, tokenVersion: 3 }),
    ).rejects.toBeInstanceOf(AuthorizationContextError);
  });

  it('supports disabling the cache entirely (AUTHORITY_CACHE_TTL_MS=0)', async () => {
    process.env.AUTHORITY_CACHE_TTL_MS = '0';
    const { service: resolver, query } = service();
    const first = await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    const second = await resolver.resolve({ userId: USER_ID, tenantId: TENANT_A, tokenVersion: 3 });
    expect(first.cache).toBe('disabled');
    expect(second.cache).toBe('disabled');
    expect(query).toHaveBeenCalledTimes(2);
  });
});


describe('BranchScopeService (server-side branch scope)', () => {
  const scope = (rows: unknown) => {
    const query = jest.fn().mockResolvedValue(rows);
    return { service: new BranchScopeService({ query } as never), query };
  };
  const oversight = { tenantId: TENANT_A, userId: USER_ID, roles: ['operations_manager'], permissions: [] };
  const teacher = { tenantId: TENANT_A, userId: USER_ID, roles: ['teacher'], permissions: [] };

  it('grants every active branch of the tenant to oversight authority (tenant-scoped query)', async () => {
    const { service, query } = scope([{ branchId: BRANCH_A, name: 'Merkez Kampüs' }]);
    const branches = await service.listAccessibleBranches(oversight);
    expect(branches).toEqual([{ branchId: BRANCH_A, name: 'Merkez Kampüs' }]);
    expect(String(query.mock.calls[0][0])).toContain('FROM branches b');
    expect(query.mock.calls[0][1]).toEqual([TENANT_A]);
  });

  it('limits a teacher to assigned branches inside the active period', async () => {
    const { service, query } = scope([{ branchId: BRANCH_B, name: 'Ek Bina' }]);
    const branches = await service.listAccessibleBranches(teacher);
    const sql = String(query.mock.calls[0][0]);
    expect(branches).toEqual([{ branchId: BRANCH_B, name: 'Ek Bina' }]);
    expect(sql).toContain('teacher_branches');
    expect(sql).toContain('effective_from <= CURRENT_DATE');
    expect(query.mock.calls[0][1]).toEqual([TENANT_A, USER_ID]);
  });

  it('grants no scope when the actor has neither oversight nor assignment (fail-closed)', async () => {
    const { service } = scope([]);
    await expect(
      service.listAccessibleBranches({ ...teacher, roles: ['parent'] }),
    ).resolves.toEqual([]);
  });

  it('rejects a client-supplied branch id outside the accessible set', async () => {
    const { service } = scope([{ branchId: BRANCH_A, name: 'Merkez Kampüs' }]);
    await expect(service.resolveSelection(oversight, { branchId: BRANCH_B })).rejects.toBeInstanceOf(
      AuthorizationContextError,
    );
  });

  it('rejects an ambiguous client-supplied branch name', async () => {
    const { service } = scope([
      { branchId: BRANCH_A, name: 'Merkez' },
      { branchId: BRANCH_B, name: 'merkez' },
    ]);
    await expect(
      service.resolveSelection(oversight, { branchName: 'Merkez' }),
    ).rejects.toBeInstanceOf(AuthorizationContextError);
  });

  it('accepts a matching selection and otherwise defaults only when unambiguous', async () => {
    const single = scope([{ branchId: BRANCH_A, name: 'Merkez Kampüs' }]);
    await expect(
      single.service.resolveSelection(oversight, { branchName: 'merkez kampüs' }),
    ).resolves.toEqual({
      branchId: BRANCH_A,
      branchName: 'Merkez Kampüs',
      source: 'request_selection',
    });
    await expect(single.service.resolveSelection(oversight, {})).resolves.toEqual({
      branchId: BRANCH_A,
      branchName: 'Merkez Kampüs',
      source: 'membership_default',
    });

    const multiple = scope([
      { branchId: BRANCH_A, name: 'Merkez' },
      { branchId: BRANCH_B, name: 'Ek Bina' },
    ]);
    await expect(multiple.service.resolveSelection(oversight, {})).resolves.toBeNull();
  });
});

describe('ContextCatalogService (versioned, human-readable catalog)', () => {
  const context = (overrides: Partial<RequestContext> = {}): RequestContext => ({
    requestId: 'req-1',
    tenantId: TENANT_A,
    userId: USER_ID,
    roles: ['operations_manager'],
    permissions: ['tenant:branch:read'],
    activeRole: 'operations_manager',
    ...overrides,
  });

  const catalog = (options: {
    tenantName?: string | null;
    branches?: unknown[];
    active?: unknown;
  }) => {
    const query = jest.fn().mockImplementation((sql: string) =>
      Promise.resolve(
        String(sql).includes('FROM tenants') ? (options.tenantName ? [{ name: options.tenantName }] : []) : [],
      ),
    );
    const branchScope = {
      listAccessibleBranches: jest.fn().mockResolvedValue(options.branches ?? []),
      resolveSelection: jest.fn().mockResolvedValue(options.active ?? null),
    };
    return {
      service: new ContextCatalogService({ query } as never, branchScope as never),
      query,
      branchScope,
    };
  };

  it('returns human-readable institution and branch names only', async () => {
    const { service } = catalog({
      tenantName: 'Atatürk Ortaokulu',
      branches: [{ branchId: BRANCH_A, name: 'Merkez Kampüs' }],
      active: { branchId: BRANCH_A, branchName: 'Merkez Kampüs', source: 'membership_default' },
    });
    const response = await service.build(context());
    expect(response.version).toBe(CONTEXT_CATALOG_VERSION);
    expect(response.institution.name).toBe('Atatürk Ortaokulu');
    expect(response.branches).toEqual([{ name: 'Merkez Kampüs' }]);
    expect(response.activeBranch).toEqual({ name: 'Merkez Kampüs' });
    expect(response.role).toEqual({ key: 'operations_manager', label: 'Operasyon Yöneticisi' });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i); // iç UUID yok
    expect(serialized).not.toMatch(/etag|tenantId|branchId|permission/i); // iç anahtar/jargon yok
  });

  it('returns no branches when the actor has no branch scope, without leaking others', async () => {
    const { service } = catalog({ tenantName: 'Atatürk Ortaokulu', branches: [], active: null });
    const response = await service.build(context({ roles: ['parent'], activeRole: 'parent' }));
    expect(response.branches).toEqual([]);
    expect(response.activeBranch).toBeNull();
  });

  it('fails closed when the institution is missing or inactive', async () => {
    const { service } = catalog({ tenantName: null });
    await expect(service.build(context())).rejects.toBeInstanceOf(AuthorizationContextError);
  });

  it('fails closed without a server-resolved tenant/user context', async () => {
    const { service } = catalog({ tenantName: 'Atatürk Ortaokulu' });
    await expect(service.build(context({ tenantId: undefined }))).rejects.toBeInstanceOf(
      AuthorizationContextError,
    );
  });

  it('humanizes unknown roles instead of leaking raw jargon', () => {
    expect(roleLabel('operations_manager')).toBe('Operasyon Yöneticisi');
    expect(roleLabel('okul_muduru')).toBe('Okul muduru');
    expect(roleLabel(null)).toBeNull();
  });
});

