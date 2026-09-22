import { ForbiddenException } from '@nestjs/common';
import { AttendanceAccessService } from './attendance-access.service';
import { TeacherRepository } from '../teachers/teacher.repository';
import { RequestContext, RequestUser } from '../common/context/request-context';

describe('AttendanceAccessService (users.id -> teachers.id çözümlemesi)', () => {
  const makeUser = (overrides: Partial<RequestUser> = {}): RequestUser => ({
    userId: 'user-1',
    tenantId: 't1',
    roleIds: ['teacher'],
    permissions: [],
    ...overrides,
  });

  const makeCtx = (user: RequestUser | undefined): RequestContext => ({
    requestId: 'req-1',
    tenantId: user?.tenantId,
    user,
  });

  function setup(
    findActiveTeacherForUser: jest.Mock,
  ): { service: AttendanceAccessService; teachers: TeacherRepository } {
    const teachers = { findActiveTeacherForUser } as unknown as TeacherRepository;
    return { service: new AttendanceAccessService(teachers), teachers };
  }

  it('resolves the users.id -> teachers.id mapping for an owning teacher', async () => {
    const findActiveTeacherForUser: jest.Mock = jest.fn(async () => ({
      teacherId: 'teacher-row-1',
    }));
    const { service } = setup(findActiveTeacherForUser);

    const actor = await service.resolve(makeUser(), 'req-1');

    expect(actor).toMatchObject({
      userId: 'user-1',
      tenantId: 't1',
      roleIds: ['teacher'],
      teacherId: 'teacher-row-1',
      // Durable audit correlation ID'si aktöre taşınır (#259).
      requestId: 'req-1',
    });
    expect(findActiveTeacherForUser).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1' }),
    );
    // Kiracı kapsamı: sorgu bağlamı JWT kiracısı ile user kiracısını eşitler.
    const ctx = findActiveTeacherForUser.mock.calls[0][0] as RequestContext;
    expect(ctx.user?.tenantId).toBe(ctx.tenantId);
  });

  it('skips the teacher lookup for oversight roles (tenant-wide authority)', async () => {
    const findActiveTeacherForUser = jest.fn();
    const { service, teachers } = setup(findActiveTeacherForUser);

    const actor = await service.resolve(
      makeUser({ userId: 'mgr-1', roleIds: ['operations_manager'] }),
      'req-1',
    );

    expect(actor.teacherId).toBeNull();
    expect(teachers.findActiveTeacherForUser).not.toHaveBeenCalled();
  });

  it('returns a null teacherId for authenticated non-teachers (students)', async () => {
    const findActiveTeacherForUser = jest.fn(async () => null);
    const { service } = setup(findActiveTeacherForUser);

    const actor = await service.resolve(
      makeUser({ userId: 'student-1', roleIds: ['student'] }),
      'req-1',
    );

    expect(actor.teacherId).toBeNull();
  });

  it('rejects requests without an authenticated user (fail-closed)', async () => {
    const findActiveTeacherForUser = jest.fn();
    const { service } = setup(findActiveTeacherForUser);

    await expect(service.resolve(undefined, 'req-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findActiveTeacherForUser).not.toHaveBeenCalled();
  });

  it('rejects requests without a tenant context (fail-closed)', async () => {
    const findActiveTeacherForUser = jest.fn();
    const { service } = setup(findActiveTeacherForUser);

    await expect(
      service.resolve(makeUser({ tenantId: undefined }), 'req-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findActiveTeacherForUser).not.toHaveBeenCalled();
  });

  it('passes the request id through for audit correlation', async () => {
    const findActiveTeacherForUser: jest.Mock = jest.fn(async () => null);
    const { service } = setup(findActiveTeacherForUser);

    await service.resolve(makeUser(), 'req-42');

    const ctx = findActiveTeacherForUser.mock.calls[0][0] as RequestContext;
    expect(ctx.requestId).toBe('req-42');
  });
});
