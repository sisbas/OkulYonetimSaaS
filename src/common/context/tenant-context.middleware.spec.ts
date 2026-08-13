import { ForbiddenException } from '@nestjs/common';
import { TenantContextMiddleware } from './tenant-context.middleware';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

describe('TenantContextMiddleware', () => {
  it('rejects a spoofed X-Tenant-Id that does not match the JWT tenant', () => {
    const req: any = {
      header: (name: string) => (name === 'x-tenant-id' ? TENANT_B : undefined),
      user: { tenantId: TENANT_A },
    };
    expect(() => new TenantContextMiddleware().use(req, {} as any, jest.fn())).toThrow(
      ForbiddenException,
    );
  });

  it('creates request context from JWT tenant (trusted source)', () => {
    const next = jest.fn();
    const req: any = {
      header: () => undefined,
      user: { tenantId: TENANT_A, userId: 'user-a', roleIds: [], permissions: [] },
    };
    new TenantContextMiddleware().use(req, {} as any, next);
    expect(req.context.tenantId).toBe(TENANT_A);
    expect(req.context.requestId).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('does NOT fail closed on unauthenticated (tenant-less) requests', () => {
    const next = jest.fn();
    const req: any = { header: () => undefined, user: undefined };
    expect(() => new TenantContextMiddleware().use(req, {} as any, next)).not.toThrow();
    expect(req.context.tenantId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('preserves a header-only (non-UUID) tenant so downstream guards can decide', () => {
    // The global middleware intentionally does NOT enforce UUID format; that is
    // the job of TenantScopeGuard. This keeps unauthenticated routes (e.g.
    // /api/v1/daily-operations/today) returning 401 rather than 403.
    const next = jest.fn();
    const req: any = { header: (name: string) => (name === 'x-tenant-id' ? 'tenant-b' : undefined) };
    new TenantContextMiddleware().use(req, {} as any, next);
    expect(req.context.tenantId).toBe('tenant-b');
    expect(next).toHaveBeenCalled();
  });
});
