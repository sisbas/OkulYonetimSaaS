import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RequestContext } from '../context/request-context';
import {
  CrossTenantAccessError,
  TenantResolutionError,
  TenantScopeRequiredError,
} from './tenant-scope.error';
import {
  assertNoCrossTenantTenantKey,
  detectConflictingTenantKeys,
  omitTenantKeys,
  tenantData,
  tenantWhere,
} from './tenant-query.helper';
import {
  assertSameTenant,
  assertNoForeignTenantInRecord,
  isSameTenant,
} from './tenant-cross-tenant-detector';
import {
  InMemoryRecordStore,
  TenantScopedInMemoryRepository,
} from './tenant-inmemory.repository';
import {
  isValidTenantId,
  resolveTenantContext,
  verifyTenantBootstrap,
} from './tenant-bootstrap';
import { TenantScopeGuard } from './tenant-scope.guard';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MALFORMED = 'tenant-b';

const ctxA: RequestContext = { requestId: 'req-a', tenantId: A, user: { userId: 'u1', tenantId: A, roleIds: [], permissions: [] } };
const ctxB: RequestContext = { requestId: 'req-b', tenantId: B };

function fakeReq(headerValue: string | undefined, user?: RequestContext['user']) {
  return {
    header: (name: string) => (name === 'x-tenant-id' ? headerValue : undefined),
    user,
  };
}

describe('Tenant isolation hardening — penetration-style suite', () => {
  describe('Cross-tenant access prevention (query helpers)', () => {
    it('[PEN-1] forges a foreign tenant_id in WHERE → fail-safe silent override to caller tenant', () => {
      const where = tenantWhere(ctxA, { tenant_id: B, status: 'active' }, 'branches');
      expect(where).toEqual({ status: 'active', tenant_id: A });
      expect(where.tenant_id).toBe(A);
    });

    it('[PEN-2] forges tenantId (camelCase) in data payload → stripped and re-stamped', () => {
      const data = tenantData(ctxA, { tenantId: B, name: 'Main' }, 'branches');
      expect(data).toEqual({ name: 'Main', tenant_id: A });
    });

    it('[PEN-3] assertNoCrossTenantTenantKey throws CrossTenantAccessError (403) on foreign id', () => {
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenant_id: B }, 'branches')).toThrow(
        CrossTenantAccessError,
      );
    });

    it('[PEN-4] assertNoCrossTenantTenantKey raises on both tenant_id and tenantId forgeries', () => {
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenant_id: B })).toThrow(CrossTenantAccessError);
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenantId: B })).toThrow(CrossTenantAccessError);
      // A matching tenant does NOT throw.
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenant_id: A })).not.toThrow();
    });

    it('[PEN-5] tenantWhere/tenantData reject a missing scope with TenantScopeRequiredError', () => {
      const ctxNoTenant: RequestContext = { requestId: 'x' };
      expect(() => tenantWhere(ctxNoTenant, {}, 'branches')).toThrow(TenantScopeRequiredError);
      expect(() => tenantData(ctxNoTenant, { name: 'x' }, 'branches')).toThrow(TenantScopeRequiredError);
    });

    it('[PEN-6] assertSameTenant blocks returning a foreign-tenant record (IDOR)', () => {
      expect(() => assertSameTenant(ctxA, B, 'branches')).toThrow(CrossTenantAccessError);
      expect(() => assertSameTenant(ctxA, undefined, 'branches')).toThrow(CrossTenantAccessError);
    });

    it('[PEN-7] assertSameTenant allows same-tenant and isSameTenant helper agrees', () => {
      expect(() => assertSameTenant(ctxA, A, 'branches')).not.toThrow();
      expect(isSameTenant(ctxA, A)).toBe(true);
      expect(isSameTenant(ctxA, B)).toBe(false);
    });

    it('[PEN-8] assertNoForeignTenantInRecord detects a forged tenant on unknown column', () => {
      expect(() => assertNoForeignTenantInRecord(ctxA, { tenant_id: B }, 'branches')).toThrow(
        CrossTenantAccessError,
      );
      expect(() => assertNoForeignTenantInRecord(ctxA, { tenant_id: A })).not.toThrow();
      expect(() => assertNoForeignTenantInRecord(ctxA, { name: 'x' })).not.toThrow();
    });

    it('[PEN-9] omitTenantKeys removes both tenant key variants', () => {
      expect(omitTenantKeys({ tenant_id: B, tenantId: B, name: 'x' })).toEqual({ name: 'x' });
    });
  });

  describe('Tenant-scoped repository (reference implementation)', () => {
    function seed(repo: TenantScopedInMemoryRepository) {
      // @ts-expect-error access protected store for seeding
      const store: InMemoryRecordStore = repo.rawStore;
      store.put({ id: 'a1', tenant_id: A, name: 'A-branch' });
      store.put({ id: 'b1', tenant_id: B, name: 'B-branch' });
    }

    it('[PEN-10] findById returns null for a cross-tenant row id (no leak)', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'branches' });
      seed(repo);
      await expect(repo.findById(ctxA, 'b1')).resolves.toBeNull();
      await expect(repo.findById(ctxA, 'a1')).resolves.toMatchObject({ id: 'a1', tenant_id: A });
    });

    it('[PEN-11] findMany returns only same-tenant rows', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'branches' });
      seed(repo);
      await expect(repo.findMany(ctxA)).resolves.toEqual([{ id: 'a1', tenant_id: A, name: 'A-branch' }]);
    });

    it('[PEN-12] create always stamps the request tenant regardless of payload forgery', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'branches' });
      const created = await repo.create(ctxA, { tenant_id: B, id: 'new', name: 'evil' });
      expect(created.tenant_id).toBe(A);
      expect(created).not.toHaveProperty('tenantId');
    });

    it('[PEN-13] update rejects foreign id (cannot mutate another tenant row)', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'branches' });
      seed(repo);
      await expect(repo.update(ctxA, 'b1', { name: 'hacked' })).rejects.toThrow(CrossTenantAccessError);
      // Same-tenant update succeeds and is scoped.
      await expect(repo.update(ctxA, 'a1', { name: 'renamed' })).resolves.toBeUndefined();
      const updated = await repo.findById(ctxA, 'a1');
      expect(updated?.name).toBe('renamed');
    });

    it('[PEN-14] update rejects a forged tenant key inside the payload', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'branches' });
      seed(repo);
      await expect(repo.update(ctxA, 'a1', { tenant_id: B, name: 'x' })).rejects.toThrow(CrossTenantAccessError);
    });

    it('[PEN-15] remove rejects foreign id', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'branches' });
      seed(repo);
      await expect(repo.remove(ctxA, 'b1')).rejects.toThrow(CrossTenantAccessError);
      await expect(repo.remove(ctxA, 'a1')).resolves.toBeUndefined();
      await expect(repo.findById(ctxA, 'a1')).resolves.toBeNull();
    });

    it('[PEN-16] every operation requires a tenant scope', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'branches' });
      const noScope: RequestContext = { requestId: 'x' };
      await expect(repo.findById(noScope, 'a1')).rejects.toThrow(TenantScopeRequiredError);
      await expect(repo.findMany(noScope)).rejects.toThrow(TenantScopeRequiredError);
      await expect(repo.create(noScope, { name: 'x' })).rejects.toThrow(TenantScopeRequiredError);
    });
  });

  describe('Tenant bootstrapping validation', () => {
    it('[PEN-17] isValidTenantId accepts UUIDs, rejects slugs and SQL fragments', () => {
      expect(isValidTenantId(A)).toBe(true);
      expect(isValidTenantId('tenant-a')).toBe(false);
      expect(isValidTenantId("a'; DROP TABLE tenants;--")).toBe(false);
      expect(isValidTenantId(undefined)).toBe(false);
    });

    it('[PEN-18] resolves tenant from JWT (trusted) and ignores a matching header', () => {
      const resolved = resolveTenantContext(fakeReq(A, { userId: 'u1', tenantId: A, roleIds: [], permissions: [] }));
      expect(resolved.tenantId).toBe(A);
      expect(resolved.source).toBe('jwt');
    });

    it('[PEN-19] rejects header/token mismatch (spoofed X-Tenant-Id)', () => {
      expect(() =>
        resolveTenantContext(fakeReq(B, { userId: 'u1', tenantId: A, roleIds: [], permissions: [] })),
      ).toThrow(TenantResolutionError);
    });

    it('[PEN-20] rejects a malformed token tenant_id', () => {
      expect(() =>
        resolveTenantContext(fakeReq(undefined, { userId: 'u1', tenantId: MALFORMED, roleIds: [], permissions: [] })),
      ).toThrow(TenantResolutionError);
    });

    it('[PEN-21] rejects a malformed X-Tenant-Id header', () => {
      expect(() => resolveTenantContext(fakeReq(MALFORMED))).toThrow(TenantResolutionError);
    });

    it('[PEN-22] fails closed when no tenant can be resolved', () => {
      expect(() => resolveTenantContext(fakeReq(undefined))).toThrow(TenantResolutionError);
      expect(() => resolveTenantContext({ header: () => undefined, user: undefined })).toThrow(
        TenantResolutionError,
      );
    });

    it('[PEN-23] accepts a header-only tenant (untrusted source) for bootstrapping', () => {
      const resolved = resolveTenantContext(fakeReq(B));
      expect(resolved.tenantId).toBe(B);
      expect(resolved.source).toBe('header');
    });

    it('[PEN-24] verifyTenantBootstrap validates consistency', () => {
      const ok = resolveTenantContext(fakeReq(A, { userId: 'u1', tenantId: A, roleIds: [], permissions: [] }));
      expect(verifyTenantBootstrap(ok)).toBe(true);
      // token tenant disagrees with resolved → bootstrap invalid
      const bad = { requestId: 'r', tenantId: A, source: 'jwt' as const, user: { userId: 'u1', tenantId: B, roleIds: [], permissions: [] } };
      expect(verifyTenantBootstrap(bad)).toBe(false);
      expect(verifyTenantBootstrap({ requestId: 'r', tenantId: '', source: 'bootstrap' as const })).toBe(false);
      expect(verifyTenantBootstrap({ requestId: 'r', tenantId: MALFORMED, source: 'bootstrap' as const })).toBe(false);
    });
  });

  describe('TenantScopeGuard (NestJS integration)', () => {
    function makeCtx(req: unknown): ExecutionContext {
      return {
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}), getNext: () => jest.fn() }),
      } as unknown as ExecutionContext;
    }

    it('[PEN-25] allows a JWT-resolved request and writes validated context', () => {
      const req: any = fakeReq(A, { userId: 'u1', tenantId: A, roleIds: [], permissions: [] });
      const guard = new TenantScopeGuard();
      expect(guard.canActivate(makeCtx(req))).toBe(true);
      expect(req.context.tenantId).toBe(A);
    });

    it('[PEN-26] blocks a spoofed header with 403 Forbidden', () => {
      const req: any = fakeReq(B, { userId: 'u1', tenantId: A, roleIds: [], permissions: [] });
      const guard = new TenantScopeGuard();
      expect(() => guard.canActivate(makeCtx(req))).toThrow(ForbiddenException);
    });

    it('[PEN-27] blocks missing/garbage tenant with 401 Unauthorized', () => {
      const req: any = fakeReq(undefined);
      const guard = new TenantScopeGuard();
      expect(() => guard.canActivate(makeCtx(req))).toThrow(UnauthorizedException);
    });
  });

  describe('End-to-end penetration narrative', () => {
    it('[PEN-28] Attacker with tenant A token cannot read/alter tenant B data via repo or helpers', async () => {
      const repo = new TenantScopedInMemoryRepository(new InMemoryRecordStore(), { tableName: 'students' });
      await repo.create(ctxB, { id: 's1', name: 'Victim' }); // belongs to B

      // Attempt direct read by id as tenant A
      await expect(repo.findById(ctxA, 's1')).resolves.toBeNull();
      // Attempt list as tenant A
      await expect(repo.findMany(ctxA)).resolves.toEqual([]);
      // Attempt mutation by id as tenant A
      await expect(repo.update(ctxA, 's1', { name: 'Pwned' })).rejects.toThrow(CrossTenantAccessError);
      // Attempt forged WHERE that claims tenant B -> fail-safe override to caller tenant
      expect(tenantWhere(ctxA, { tenant_id: B }, 'students').tenant_id).toBe(A);
      // Victim data is untouched
      await expect(repo.findById(ctxB, 's1')).resolves.toMatchObject({ id: 's1', name: 'Victim' });
    });
  });

  describe('CodeRabbit PR#225 — fail-closed hardening', () => {
    it('[CR-1] ctx.tenantId yoksa assertNoCrossTenantTenantKey 403 fırlatır (fail-closed)', () => {
      const noScope: RequestContext = { requestId: 'x' };
      expect(() =>
        assertNoCrossTenantTenantKey(noScope, { tenant_id: B }, 'branches'),
      ).toThrow(CrossTenantAccessError);
      // Foreign bir gövde olsa bile tenantId olmadan fail-open olmamalı.
      expect(() => assertNoCrossTenantTenantKey(noScope, { tenant_id: A }, 'branches')).toThrow(
        CrossTenantAccessError,
      );
    });

    it('[CR-2] null/undefined tenant damgası "geçersiz/foreign" sayılır → 403', () => {
      // null damga: {tenant_id: null} → sentinel → foreign → denial.
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenant_id: null }, 'branches')).toThrow(
        CrossTenantAccessError,
      );
      // çift alias: tenantId eşleşse bile tenant_id null → yine reddedilir.
      expect(() =>
        assertNoCrossTenantTenantKey(ctxA, { tenantId: A, tenant_id: null }, 'branches'),
      ).toThrow(CrossTenantAccessError);
      // Aynı koruma assertNoForeignTenantInRecord için de geçerli.
      expect(() => assertNoForeignTenantInRecord(ctxA, { tenant_id: null }, 'branches')).toThrow(
        CrossTenantAccessError,
      );
      // Mevcut olmayan (absent) anahtar null sayılmaz: yalnız tenantId gelirse izin verilir.
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenantId: A })).not.toThrow();
    });
  });

  describe('Tenant-key alias conflict validation (P2 — double alias)', () => {
    it('[PEN-29] resolveTenantContext: çift header alias çakışması (x-tenant-id=A, tenant-id=B) → 403', () => {
      const req: any = {
        header: (name: string) => (name === 'x-tenant-id' ? A : name === 'tenant-id' ? B : undefined),
        user: undefined,
      };
      let thrown: any;
      try {
        resolveTenantContext(req);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(TenantResolutionError);
      expect(thrown.mismatch).toBe(true);
    });

    it('[PEN-30] assertNoForeignTenantInRecord: {tenantId:A, tenant_id:B} çift alias → 403', () => {
      expect(() => assertNoForeignTenantInRecord(ctxA, { tenantId: A, tenant_id: B }, 'branches')).toThrow(
        CrossTenantAccessError,
      );
      // Aynı değerler (çakışma yok) → izin verilir.
      expect(() => assertNoForeignTenantInRecord(ctxA, { tenantId: A, tenant_id: A }, 'branches')).not.toThrow();
    });

    it('[PEN-31] assertNoCrossTenantTenantKey: çift alias çakışması → 403', () => {
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenantId: A, tenant_id: B }, 'branches')).toThrow(
        CrossTenantAccessError,
      );
      // Sadece matching tek alias → izin verilir.
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenant_id: A })).not.toThrow();
      expect(() => assertNoCrossTenantTenantKey(ctxA, { tenantId: A })).not.toThrow();
    });

    it('[PEN-32] malformed header alias tekil olsa bile reddedilir', () => {
      const req: any = { header: (name: string) => (name === 'tenant-id' ? MALFORMED : undefined) };
      expect(() => resolveTenantContext(req)).toThrow(TenantResolutionError);
    });
  });
});
