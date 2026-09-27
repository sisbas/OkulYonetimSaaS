import { RequestContext } from '../common/context/request-context';
import { ForbiddenException } from '@nestjs/common';
import { LeaveExpectedVersionRequiredException, LeaveNotFoundException } from './leave-errors';
import { LeaveSelfDecisionException } from './leave-errors';
import { LeaveCoverageStatus, LeaveDecisionStatus, LeaveRequest } from './leave-request.entity';
import { LEAVE_DECISION_RESPONSE_FIELDS } from './leave-decision-labels';
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

function decidedLeave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: '90000000-0000-4000-8000-000000000001',
    tenantId: '00000000-0000-4000-8000-000000000001',
    branchId: '30000000-0000-4000-8000-000000000001',
    teacherId: '20000000-0000-4000-8000-000000000001',
    requesterUserId: 'requester',
    durationType: 'full_day',
    reasonCode: 'annual_leave',
    decisionStatus: LeaveDecisionStatus.APPROVED,
    coverageStatus: LeaveCoverageStatus.UNRESOLVED,
    startsAt: new Date('2026-09-14T06:00:00.000Z'),
    endsAt: new Date('2026-09-15T15:00:00.000Z'),
    decidedByUserId: 'manager-user',
    decidedAt: new Date('2026-09-10T08:00:00.000Z'),
    version: 2,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-10T08:00:00.000Z'),
    ...overrides,
  } as LeaveRequest;
}
const zeroImpact = {
  coverageStatus: LeaveCoverageStatus.NOT_REQUIRED,
  coverageLabel: 'Karşılık gerekmiyor',
  impactedLessonCount: 0,
  resolvedLessonCount: 0,
  openLessonCount: 0,
  zeroImpact: true,
  zeroImpactReason: 'NO_PUBLISHED_SCHEDULE_EVENT' as const,
  zeroImpactDetail: 'Bu öğretmen için izin döneminde yayınlanmış ders programı kaydı bulunmadığından etkilenen ders yok; ders karşılığı gerekmiyor.',
  lessons: [],
  candidates: {
    finalized: true, gapDetail: null, decisionSupportOnly: true as const,
    decisionSupportDetail: 'Aday listesi yalnız karar desteğidir.', items: [],
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

  describe('approval returns the server-computed impact (#263 R1)', () => {
    function approvalSetup(outcome: unknown) {
      const leaves = {
        findTenantScoped: jest.fn(async () => ({
          ...decidedLeave({ decisionStatus: LeaveDecisionStatus.PENDING, version: 1 }),
        })),
        decide: jest.fn(async () => outcome),
      };
      const identity = { resolveDecisionActorTeacherId: jest.fn(async () => null) };
      return { service: new LeaveService(leaves as any, identity as any), leaves };
    }

    it('returns every allowlisted field and no raw identifier', async () => {
      const { service } = approvalSetup({ leave: decidedLeave(), impact: zeroImpact });

      const response = await service.decide(
        ctx,
        '90000000-0000-4000-8000-000000000001',
        { decision: LeaveDecisionStatus.APPROVED },
        '"leave:90000000-0000-4000-8000-000000000001:v1"',
      );

      expect(Object.keys(response).sort()).toEqual([...LEAVE_DECISION_RESPONSE_FIELDS].sort());
      expect(response.decisionStatus).toBe(LeaveDecisionStatus.APPROVED);
      expect(response.decisionLabel).toBe('Onaylandı');
      expect(response.periodLabel).toBe('14.09.2026 09:00 – 15.09.2026 18:00');
      expect(response.durationLabel).toBe('Tam gün izin');
      expect(response.reasonLabel).toBe('Yıllık izin');
      expect(response.etag).toBe('"leave:90000000-0000-4000-8000-000000000001:v2"');
      expect(response.impact).toEqual(zeroImpact);
      // Sıfır etki sessiz geçilmez: özet ve etki açıklaması gerekçeyi taşır.
      expect(response.summary).toContain('etkilenen ders yok');
      expect(response.impactDetail).toContain('yayınlanmış ders programı');
      // `etag` opak sürüm jetonudur (If-Match sözleşmesi); gövdede başka ham kimlik yok.
      expect(JSON.stringify({ ...response, etag: '' }))
        .not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    });

    it('states that a rejection performs no impact analysis', async () => {
      const { service } = approvalSetup({
        leave: decidedLeave({
          decisionStatus: LeaveDecisionStatus.REJECTED,
          coverageStatus: LeaveCoverageStatus.NOT_REQUIRED,
        }),
        impact: null,
      });

      const response = await service.decide(
        ctx,
        '90000000-0000-4000-8000-000000000001',
        { decision: LeaveDecisionStatus.REJECTED },
        '"leave:90000000-0000-4000-8000-000000000001:v1"',
      );

      expect(response.impact).toBeNull();
      expect(response.impactDetail).toContain('Ret kararında ders etkisi hesaplanmaz');
      expect(response.summary).toContain('reddedildi');
    });

    it('requires an If-Match version before touching the repository', async () => {
      const leaves = { findTenantScoped: jest.fn(), decide: jest.fn() };
      const service = new LeaveService(leaves as any, {} as any);

      await expect(service.decide(ctx, '90000000-0000-4000-8000-000000000001',
        { decision: LeaveDecisionStatus.APPROVED }, undefined))
        .rejects.toBeInstanceOf(LeaveExpectedVersionRequiredException);
      expect(leaves.findTenantScoped).not.toHaveBeenCalled();
      expect(leaves.decide).not.toHaveBeenCalled();
    });
  });

  describe('decision actor identity (#263/#259)', () => {
    const pendingLeave = {
      ...decidedLeave({ decisionStatus: LeaveDecisionStatus.PENDING, version: 1 }),
      requesterUserId: 'requester',
      teacherId: 'teacher-self',
    };
    const ifMatch = '"leave:90000000-0000-4000-8000-000000000001:v1"';

    function setup(resolve: jest.Mock) {
      const leaves = {
        findTenantScoped: jest.fn(async () => pendingLeave),
        decide: jest.fn(async () => ({ leave: decidedLeave(), impact: zeroImpact })),
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

    it('blocks self-approval before the impact transaction is started', async () => {
      const { service, leaves } = setup(jest.fn().mockResolvedValue('teacher-self'));
      await expect(service.decide(ctx, pendingLeave.id, { decision: LeaveDecisionStatus.APPROVED }, ifMatch))
        .rejects.toBeInstanceOf(LeaveSelfDecisionException);
      expect(leaves.decide).not.toHaveBeenCalled();
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
