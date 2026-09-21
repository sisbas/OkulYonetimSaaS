import { AttendanceSessionController } from './attendance.controller';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceAccessService } from './attendance-access.service';
import { AttendanceSession, AttendanceSessionStatus } from './attendance-session.entity';
import { AttendanceActor } from './attendance-access';
import { RequestWithContext } from '../common/context/request-context';

describe('AttendanceSessionController list() (P1: users.id vs teachers.id)', () => {
  const USERS_ID = '11111111-1111-4111-8111-111111111111';
  const TEACHERS_ID = '22222222-2222-4222-8222-222222222222';
  const TENANT_ID = '33333333-3333-4333-8333-333333333333';

  const makeActor = (
    overrides: Partial<AttendanceActor> = {},
  ): AttendanceActor => ({
    userId: USERS_ID,
    tenantId: TENANT_ID,
    roleIds: ['teacher'],
    teacherId: TEACHERS_ID,
    ...overrides,
  });

  const makeSession = (): AttendanceSession => ({
    id: '44444444-4444-4444-8444-444444444444',
    tenantId: TENANT_ID,
    branchId: 'b1',
    scheduleEventId: 'evt-1',
    teacherId: TEACHERS_ID,
    studentGroupId: 'grp-1',
    courseId: 'c1',
    roomId: 'r1',
    sessionDate: new Date('2026-09-01'),
    rosterSnapshot: ['s1'],
    status: AttendanceSessionStatus.PUBLISHED,
    version: 1,
    lockedById: null,
    lockedAt: null,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
  });

  function setup(
    resolveResult: AttendanceActor,
    sessionService: Partial<AttendanceSessionService>,
  ): { controller: AttendanceSessionController; req: RequestWithContext } {
    const access = {
      resolve: jest.fn(async () => resolveResult),
    } as unknown as AttendanceAccessService;
    const controller = new AttendanceSessionController(
      sessionService as AttendanceSessionService,
      access,
    );
    const req = { context: { requestId: 'req-1' } } as RequestWithContext;
    return { controller, req };
  }

  it('queries the teacher list with the resolved teachers.id, not users.id (P1 regression)', async () => {
    const listByTeacher = jest.fn(async () => [makeSession()]);
    const listByTenant = jest.fn();
    const { controller, req } = setup(makeActor(), { listByTeacher, listByTenant });

    const result = await controller.list(req);

    // BOLA: users.id ile sorgu boş liste döndürür; doğru anahtar teachers.id.
    expect(listByTeacher).toHaveBeenCalledWith(TENANT_ID, TEACHERS_ID);
    expect(listByTeacher).not.toHaveBeenCalledWith(TENANT_ID, USERS_ID);
    expect(listByTenant).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('returns tenant-wide sessions for oversight roles', async () => {
    const listByTeacher = jest.fn();
    const listByTenant = jest.fn(async () => [makeSession()]);
    const { controller, req } = setup(
      makeActor({
        userId: 'mgr-1',
        roleIds: ['operations_manager'],
        teacherId: null,
      }),
      { listByTeacher, listByTenant },
    );

    const result = await controller.list(req);

    expect(listByTenant).toHaveBeenCalledWith(TENANT_ID);
    expect(listByTeacher).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('returns an information-free empty list when teacher identity is unresolved', async () => {
    const listByTeacher = jest.fn();
    const { controller, req } = setup(makeActor({ teacherId: null }), {
      listByTeacher,
    });

    const result = await controller.list(req);

    expect(result).toEqual([]);
    expect(listByTeacher).not.toHaveBeenCalled();
  });
});
