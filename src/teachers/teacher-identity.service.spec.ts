import { ForbiddenException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { TeacherIdentityService } from './teacher-identity.service';

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: 'req-1',
    tenantId: '00000000-0000-4000-8000-000000000001',
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

  it('resolves teacher identity from authenticated user and active branch membership', async () => {
    const repo = {
      findActiveTeacherForUser: jest.fn(async () => ({ teacherId: '20000000-0000-4000-8000-000000000001' })),
      listActiveBranchMemberships: jest.fn(async () => [{ teacherBranchId: '30000000-0000-4000-8000-000000000001', branchId: '40000000-0000-4000-8000-000000000001' }]),
    };
    const result = await new TeacherIdentityService(repo as any, audit as any).resolveForRequest(ctx(), { branchId: '40000000-0000-4000-8000-000000000001', effectiveDate: '2026-09-01' });
    expect(result.teacherId).toBe('20000000-0000-4000-8000-000000000001');
    expect(repo.findActiveTeacherForUser).toHaveBeenCalledWith(expect.objectContaining({ tenantId: result.tenantId }));
    expect(repo.listActiveBranchMemberships).toHaveBeenCalledWith(expect.anything(), result.teacherId, expect.objectContaining({ branchId: result.branchId }));
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
