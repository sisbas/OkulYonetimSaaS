import { ForbiddenException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { TeacherIdentityService } from './teacher-identity.service';

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: 'req-1',
    tenantId: '00000000-0000-4000-8000-000000000001',
    businessDate: {
      tenantId: '00000000-0000-4000-8000-000000000001',
      date: '2026-09-01',
      source: 'tenant_local',
    },
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-000000000001',
      roleIds: ['teacher'],
      permissions: ['teacher:own:read'],
    },
    ...overrides,
  };
}

describe('TeacherIdentityService', () => {
  const audit = { emitAuthorizationDenied: jest.fn() };

  beforeEach(() => audit.emitAuthorizationDenied.mockClear());

  it('resolves teacher identity from authenticated user and tenant-local business date', async () => {
    const repo = {
      findActiveTeacherForUser: jest.fn(async () => ({ teacherId: '20000000-0000-4000-8000-000000000001' })),
      listActiveBranchMemberships: jest.fn(async () => [{ teacherBranchId: '30000000-0000-4000-8000-000000000001', branchId: '40000000-0000-4000-8000-000000000001' }]),
    };
    const result = await new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx(), { branchId: '40000000-0000-4000-8000-000000000001' });
    expect(result.teacherId).toBe('20000000-0000-4000-8000-000000000001');
    expect(result.businessDate).toBe('2026-09-01');
    expect(repo.findActiveTeacherForUser).toHaveBeenCalledWith(expect.objectContaining({ tenantId: result.tenantId }));
    expect(repo.listActiveBranchMemberships).toHaveBeenCalledWith(expect.anything(), result.teacherId, expect.objectContaining({ branchId: result.branchId, effectiveDate: '2026-09-01' }));
  });

  it('does not silently fall back to global UTC when tenant-local business date is missing', async () => {
    const repo = { findActiveTeacherForUser: jest.fn(), listActiveBranchMemberships: jest.fn() };
    await expect(new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx({ businessDate: undefined }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.findActiveTeacherForUser).not.toHaveBeenCalled();
  });

  it('rejects business dates that are not scoped to the active tenant', async () => {
    const repo = { findActiveTeacherForUser: jest.fn(), listActiveBranchMemberships: jest.fn() };
    await expect(new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx({ businessDate: { tenantId: '00000000-0000-4000-8000-000000000099', date: '2026-09-01', source: 'tenant_local' } }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.findActiveTeacherForUser).not.toHaveBeenCalled();
  });

  it('rejects shape-valid but impossible tenant-local calendar dates before repository access', async () => {
    const repo = { findActiveTeacherForUser: jest.fn(), listActiveBranchMemberships: jest.fn() };
    await expect(new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx({ businessDate: { tenantId: '00000000-0000-4000-8000-000000000001', date: '2026-02-31', source: 'tenant_local' } }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.findActiveTeacherForUser).not.toHaveBeenCalled();
    expect(repo.listActiveBranchMemberships).not.toHaveBeenCalled();
    expect(audit.emitAuthorizationDenied).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reasonCode: 'teacher_identity_unresolved' }));
  });

  it('accepts a valid leap-day tenant-local business date', async () => {
    const repo = {
      findActiveTeacherForUser: jest.fn(async () => ({ teacherId: 'teacher-leap' })),
      listActiveBranchMemberships: jest.fn(async () => [{ teacherBranchId: 'membership-leap', branchId: 'branch-leap' }]),
    };
    const result = await new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx({ businessDate: { tenantId: '00000000-0000-4000-8000-000000000001', date: '2028-02-29', source: 'tenant_local' } }));
    expect(result.businessDate).toBe('2028-02-29');
  });

  it('ignores client or token-supplied teacherId authority', async () => {
    const repo = {
      findActiveTeacherForUser: jest.fn(async () => ({ teacherId: 'server-resolved-teacher' })),
      listActiveBranchMemberships: jest.fn(async () => [{ teacherBranchId: 'membership-1', branchId: 'branch-1' }]),
    };
    const spoofed = ctx({ user: { ...(ctx().user as any), teacherId: 'client-spoofed-teacher' } as any });
    const result = await new TeacherIdentityService(repo as any, audit as any).resolveForRequest(spoofed);
    expect(result.teacherId).toBe('server-resolved-teacher');
    expect(JSON.stringify(repo.findActiveTeacherForUser.mock.calls)).not.toContain('client-spoofed-teacher');
  });

  it('rejects inactive or cross-tenant references without enumeration', async () => {
    const repo = { findActiveTeacherForUser: jest.fn(async () => null), listActiveBranchMemberships: jest.fn() };
    await expect(new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx())).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.emitAuthorizationDenied).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ resource: 'teacher', reasonCode: 'teacher_identity_unresolved' }));
  });

  it('does not choose a default branch when TeacherBranch membership is ambiguous', async () => {
    const repo = {
      findActiveTeacherForUser: jest.fn(async () => ({ teacherId: 'teacher-1' })),
      listActiveBranchMemberships: jest.fn(async () => [
        { teacherBranchId: 'membership-1', branchId: 'branch-1' },
        { teacherBranchId: 'membership-2', branchId: 'branch-2' },
      ]),
    };
    await expect(new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
