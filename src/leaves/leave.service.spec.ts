import { RequestContext } from '../common/context/request-context';
import { ForbiddenException } from '@nestjs/common';
import { LeaveNotFoundException } from './leave-errors';
import { LeaveSelfDecisionException } from './leave-errors';
import { LeaveDecisionStatus, LeaveRequest } from './leave-request.entity';
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

  describe('decision actor identity (#263/#259)', () => {
    const pendingLeave = {
      id: '90000000-0000-4000-8000-000000000001',
      requesterUserId: 'requester',
      teacherId: 'teacher-self',
      decisionStatus: LeaveDecisionStatus.PENDING,
      version: 1,
    };
    const ifMatch = '"leave:90000000-0000-4000-8000-000000000001:v1"';

    function setup(resolve: jest.Mock) {
      const leaves = {
        findTenantScoped: jest.fn(async () => pendingLeave),
        decide: jest.fn(async () => pendingLeave),
      };
      const identity = {
        resolveDecisionActorTeacherId: resolve,
        resolveTeacherIdentity: jest.fn(async () => {
          throw new ForbiddenException('Multiple effective branches');
        }),
      };
      return { service: new LeaveService(leaves as any, identity as any), leaves, identity };
    }

    it('allows a verified non-teacher manager to reject', async () => {
      const { service, leaves } = setup(jest.fn().mockResolvedValue(null));
      await service.decide(ctx, pendingLeave.id, { decision: LeaveDecisionStatus.REJECTED }, ifMatch);
      expect(leaves.decide).toHaveBeenCalledTimes(1);
    });

    it('blocks the teacher deciding their own request even when branch identity is ambiguous', async () => {
      const { service, leaves, identity } = setup(jest.fn().mockResolvedValue('teacher-self'));
      await expect(service.decide(ctx, pendingLeave.id, { decision: LeaveDecisionStatus.REJECTED }, ifMatch))
        .rejects.toBeInstanceOf(LeaveSelfDecisionException);
      expect(leaves.decide).not.toHaveBeenCalled();
      expect(identity.resolveTeacherIdentity).not.toHaveBeenCalled();
    });

    it.each([new ForbiddenException('Identity unavailable'), new Error('Database unavailable')])(
      'fails closed for unresolved identity: %s', async (error) => {
        const { service, leaves } = setup(jest.fn().mockRejectedValue(error));
        await expect(service.decide(ctx, pendingLeave.id, { decision: LeaveDecisionStatus.REJECTED }, ifMatch))
          .rejects.toBeInstanceOf(LeaveSelfDecisionException);
        expect(leaves.decide).not.toHaveBeenCalled();
      },
    );

    it('allows another teacher to reject without selecting a branch', async () => {
      const { service, leaves, identity } = setup(jest.fn().mockResolvedValue('other-teacher'));
      await service.decide(ctx, pendingLeave.id, { decision: LeaveDecisionStatus.REJECTED }, ifMatch);
      expect(leaves.decide).toHaveBeenCalledTimes(1);
      expect(identity.resolveTeacherIdentity).not.toHaveBeenCalled();
    });

    it('blocks the original requester before accessing the directory', async () => {
      const resolve = jest.fn().mockResolvedValue(null);
      const { service, leaves } = setup(resolve);
      await expect(service.decide({ ...ctx, user: { ...ctx.user!, userId: 'requester' } }, pendingLeave.id,
        { decision: LeaveDecisionStatus.REJECTED }, ifMatch)).rejects.toBeInstanceOf(LeaveSelfDecisionException);
      expect(resolve).not.toHaveBeenCalled();
      expect(leaves.decide).not.toHaveBeenCalled();
    });
  });
});
