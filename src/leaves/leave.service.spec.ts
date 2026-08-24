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

  describe('decide — self-decision guard (fail-closed, #259)', () => {
    const pendingLeave = {
      id: '90000000-0000-4000-8000-000000000001',
      requesterUserId: '10000000-0000-4000-8000-000000000001',
      teacherId: '20000000-0000-4000-8000-000000000001',
      decisionStatus: LeaveDecisionStatus.PENDING,
      version: 1,
    };

    function buildService(overrides: {
      findTenantScoped?: jest.Mock;
      resolveTeacherIdentity?: jest.Mock;
      decide?: jest.Mock;
    }) {
      const leaves = {
        findTenantScoped: overrides.findTenantScoped ?? jest.fn(async () => pendingLeave),
        decide: overrides.decide ?? jest.fn(async () => pendingLeave),
      };
      const identity = {
        resolveTeacherIdentity:
          overrides.resolveTeacherIdentity ??
          jest.fn(async () => ({
            actorUserId: '10000000-0000-4000-8000-000000000001',
            teacherId: '20000000-0000-4000-8000-000000000001',
            branchId: '30000000-0000-4000-8000-000000000001',
          })),
      };
      return { service: new LeaveService(leaves as any, identity as any), leaves, identity };
    }

    const ifMatch = 'W/"leave:90000000-0000-4000-8000-000000000001:v1"';

    it('denies self-decision when actor is the requester', async () => {
      const { service } = buildService({});
      await expect(
        service.decide(ctx, pendingLeave.id, { decision: 'REJECTED' as any }, ifMatch),
      ).rejects.toBeInstanceOf(LeaveSelfDecisionException);
    });

    it('denies self-decision when identity lookup fails (no silent bypass)', async () => {
      const { service } = buildService({
        resolveTeacherIdentity: jest.fn(async () => {
          throw new Error('identity unresolved');
        }),
      });
      await expect(
        service.decide(ctx, pendingLeave.id, { decision: 'REJECTED' as any }, ifMatch),
      ).rejects.toBeInstanceOf(LeaveSelfDecisionException);
    });

    it('does NOT deny a non-teacher approver when identity resolves to Forbidden (no teacher affiliation)', async () => {
      const approverCtx: RequestContext = {
        ...ctx,
        user: {
          ...ctx.user!,
          userId: '99999999-0000-4000-8000-000000000001',
          roleIds: ['operations_manager'],
        },
      };
      const { service, leaves, identity } = buildService({
        resolveTeacherIdentity: jest.fn(async () => {
          throw new ForbiddenException('Teacher identity unavailable');
        }),
      });
      await service.decide(approverCtx, pendingLeave.id, { decision: 'REJECTED' as any }, ifMatch);
      expect(identity.resolveTeacherIdentity).toHaveBeenCalledTimes(1);
      expect(leaves.decide).toHaveBeenCalledTimes(1);
    });

    it('DENIES (fail-closed) when identity lookup fails with a non-Forbidden error', async () => {
      const { service } = buildService({
        resolveTeacherIdentity: jest.fn(async () => {
          throw new Error('unexpected identity store failure');
        }),
      });
      await expect(
        service.decide(ctx, pendingLeave.id, { decision: 'REJECTED' as any }, ifMatch),
      ).rejects.toBeInstanceOf(LeaveSelfDecisionException);
    });
  });
});
