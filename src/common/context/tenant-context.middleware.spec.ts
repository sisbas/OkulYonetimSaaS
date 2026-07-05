import { ForbiddenException } from '@nestjs/common';
import { TenantContextMiddleware } from './tenant-context.middleware';

describe('TenantContextMiddleware', () => {
  it('rejects mismatched X-Tenant-Id and JWT tenant', () => {
    const req: any = { header: (name: string) => name === 'x-tenant-id' ? 'tenant-b' : undefined, user: { tenantId: 'tenant-a' } };
    expect(() => new TenantContextMiddleware().use(req, {} as any, jest.fn())).toThrow(ForbiddenException);
  });

  it('creates request context from JWT tenant', () => {
    const next = jest.fn();
    const req: any = { header: () => undefined, user: { tenantId: 'tenant-a', userId: 'user-a', roleIds: [], permissions: [] } };
    new TenantContextMiddleware().use(req, {} as any, next);
    expect(req.context.tenantId).toBe('tenant-a');
    expect(req.context.requestId).toBeDefined();
    expect(next).toHaveBeenCalled();
  });
});
