import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  AttendanceRequest,
  TeacherOwnLessonGuard,
} from './teacher-own-lesson.guard';
import { AttendanceSessionService } from './attendance-session.service';
import {
  AttendanceSession,
  AttendanceSessionStatus,
} from './attendance-session.entity';
import { RequestUser } from '../common/context/request-context';

describe('TeacherOwnLessonGuard (OKUL-06 / #265 AC-3)', () => {
  const makeSession = (
    overrides: Partial<AttendanceSession> = {},
  ): AttendanceSession => ({
    id: 'sess-1',
    tenantId: 't1',
    branchId: 'b1',
    scheduleEventId: 'evt-1',
    teacherId: 'teach-1',
    studentGroupId: 'grp-1',
    courseId: 'c1',
    roomId: 'r1',
    sessionDate: new Date('2026-09-01'),
    rosterSnapshot: ['s1', 's2'],
    status: AttendanceSessionStatus.PUBLISHED,
    version: 1,
    lockedById: null,
    lockedAt: null,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
    ...overrides,
  });

  const makeUser = (overrides: Partial<RequestUser> = {}): RequestUser => ({
    userId: 'teach-1',
    tenantId: 't1',
    roleIds: ['teacher'],
    permissions: ['attendance:record:update', 'attendance:own:read'],
    ...overrides,
  });

  function setup(
    getById: jest.Mock,
    request: Partial<AttendanceRequest>,
  ): { guard: TeacherOwnLessonGuard; context: ExecutionContext } {
    const sessions = { getById } as unknown as AttendanceSessionService;
    const guard = new TeacherOwnLessonGuard(sessions);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { guard, context };
  }

  it('rejects when there is no authenticated user (fail-closed)', async () => {
    const getById = jest.fn();
    const { guard, context } = setup(getById, { params: { id: 'sess-1' } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(getById).not.toHaveBeenCalled();
  });

  it('rejects when the route carries no session id (fail-closed)', async () => {
    const getById = jest.fn();
    const { guard, context } = setup(getById, {
      user: makeUser(),
      params: {},
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(getById).not.toHaveBeenCalled();
  });

  it('allows the owning teacher and attaches the session to the request', async () => {
    const getById = jest.fn(async () => makeSession());
    const request: Partial<AttendanceRequest> = {
      user: makeUser(),
      params: { id: 'sess-1' },
    };
    const { guard, context } = setup(getById, request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getById).toHaveBeenCalledWith('t1', 'sess-1');
    expect(request.attendanceSession?.id).toBe('sess-1');
  });

  it('rejects a teacher acting on another teacher session (BOLA negative)', async () => {
    const getById = jest.fn(async () =>
      makeSession({ teacherId: 'teach-2' }),
    );
    const { guard, context } = setup(getById, {
      user: makeUser(),
      params: { id: 'sess-1' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a student role on another teacher session (BOLA negative)', async () => {
    const getById = jest.fn(async () => makeSession());
    const { guard, context } = setup(getById, {
      user: makeUser({ userId: 'student-1', roleIds: ['student'] }),
      params: { id: 'sess-1' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when the session is not visible in the actor tenant (no existence leak)', async () => {
    const getById = jest.fn(async () => null);
    const { guard, context } = setup(getById, {
      user: makeUser(),
      params: { id: 'other-tenant-session' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows operations_manager without loading the session (oversight)', async () => {
    const getById = jest.fn();
    const { guard, context } = setup(getById, {
      user: makeUser({ userId: 'mgr-1', roleIds: ['operations_manager'] }),
      params: { id: 'sess-1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getById).not.toHaveBeenCalled();
  });

  it('allows tenant_admin on any tenant session (oversight)', async () => {
    const getById = jest.fn(async () => makeSession({ teacherId: 'teach-9' }));
    const { guard, context } = setup(getById, {
      user: makeUser({ userId: 'admin-1', roleIds: ['tenant_admin'] }),
      params: { id: 'sess-1' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
