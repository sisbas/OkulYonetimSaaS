import { RequestContext } from '../common/context/request-context';
import { LeaveNotFoundException } from './leave-errors';
import { LeaveService } from './leave.service';

const ctx: RequestContext = {
  requestId: 'req-1',
  tenantId: '00000000-0000-4000-8000-000000000001',
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    tenantId: '00000000-0000-4000-8000-000000000001',
    roleIds: ['teacher'],
    permissions: ['leave:own:read'],
  },
};

describe('LeaveService', () => {
  it('passes the resolved branch into own-read lookup', async () => {
    const leaves = {
      findOwn: jest.fn(async () => null),
    };
    const identity = {
      resolveTeacherIdentity: jest.fn(async () => ({
        actorUserId: '10000000-0000-4000-8000-000000000001',
        teacherId: '20000000-0000-4000-8000-000000000001',
        branchId: '30000000-0000-4000-8000-000000000001',
      })),
    };
    const service = new LeaveService(leaves as any, identity as any);

    await expect(service.getOwn(ctx, '90000000-0000-4000-8000-000000000001'))
      .rejects.toBeInstanceOf(LeaveNotFoundException);

    expect(leaves.findOwn).toHaveBeenCalledWith(
      ctx,
      '90000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
    );
  });
});
