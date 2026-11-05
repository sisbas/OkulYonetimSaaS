import { RequestContext } from '../common/context/request-context';
import { LeaveCoverageStatus, LeaveDecisionStatus, LeaveDurationType, LeaveReasonCode } from './leave-request.entity';
import {
  LeaveStaleVersionException,
  LeaveTerminalStateException,
} from './leave-errors';
import { LeaveRepository } from './leave.repository';

const ctx: RequestContext = {
  requestId: 'req-1',
  tenantId: '00000000-0000-4000-8000-000000000001',
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    tenantId: '00000000-0000-4000-8000-000000000001',
    roleIds: ['manager'],
    permissions: ['leave:approve'],
  },
};

const approvalImpact = {
  coverageStatus: LeaveCoverageStatus.UNRESOLVED,
  coverageLabel: 'Karşılık bekliyor',
  impactedLessonCount: 3,
  resolvedLessonCount: 0,
  openLessonCount: 3,
  zeroImpact: false,
  zeroImpactReason: null,
  zeroImpactDetail: null,
  lessons: [],
  candidates: {
    finalized: true,
    gapDetail: null,
    decisionSupportOnly: true as const,
    decisionSupportDetail: 'Aday listesi yalnız karar desteğidir.',
    items: [],
  },
};

describe('LeaveRepository', () => {
  it('scopes own leave reads by tenant, teacher, and resolved branch', async () => {
    const repository = { findOne: jest.fn(async () => null) };
    const leaves = new LeaveRepository(repository as any, {} as any, {} as any, {} as any);

    await leaves.findOwn(
      ctx,
      '90000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: '90000000-0000-4000-8000-000000000001',
        tenantId: '00000000-0000-4000-8000-000000000001',
        teacherId: '20000000-0000-4000-8000-000000000001',
        branchId: '30000000-0000-4000-8000-000000000001',
      },
    });
  });

  describe('decision transaction (#263 R1)', () => {
    function pendingRow(overrides: Record<string, unknown> = {}) {
      return {
        id: '90000000-0000-4000-8000-000000000001',
        tenantId: ctx.tenantId,
        branchId: '30000000-0000-4000-8000-000000000001',
        teacherId: '20000000-0000-4000-8000-000000000001',
        decisionStatus: LeaveDecisionStatus.PENDING,
        coverageStatus: LeaveCoverageStatus.NOT_REQUIRED,
        startsAt: new Date('2026-09-14T06:00:00.000Z'),
        endsAt: new Date('2026-09-14T14:00:00.000Z'),
        version: 1,
        ...overrides,
      };
    }

    function setup(options: {
      row?: Record<string, unknown> | null;
      auditError?: Error;
      impactCoverage?: LeaveCoverageStatus;
    } = {}) {
      const manager = {
        findOne: jest.fn(async () => (options.row === null ? null : pendingRow(options.row))),
        save: jest.fn(async (_entity: unknown, value: unknown) => value),
        query: jest.fn<Promise<unknown[]>, [string, unknown[]]>(async () => []),
      };
      const dataSource = { transaction: jest.fn(async (run: any) => run(manager)) };
      const audit = {
        write: jest.fn<Promise<void>, [unknown, string, { changedFields: string[] }]>(async () => {
          if (options.auditError) throw options.auditError;
        }),
      };
      const coverage = options.impactCoverage ?? LeaveCoverageStatus.UNRESOLVED;
      const impactInputs: Array<Record<string, unknown>> = [];
      const impact = {
        prepareApprovalImpact: jest.fn(async (_manager: unknown, _ctx: unknown, leave: any) => {
          // Etki, karar mutasyonundan ÖNCE hesaplanmalı: girdi durumu kaydedilir.
          impactInputs.push({
            version: leave.version,
            decisionStatus: leave.decisionStatus,
            coverageStatus: leave.coverageStatus,
          });
          return {
            coverageStatus: coverage,
            impact: { ...approvalImpact, coverageStatus: coverage },
          };
        }),
      };
      const leaves = new LeaveRepository({} as any, dataSource as any, audit as any, impact as any);
      return { leaves, manager, audit, impact, dataSource, impactInputs };
    }

    it('prepares the impact and writes audit plus outbox on the same manager', async () => {
      const { leaves, manager, audit, impact, impactInputs } = setup();

      const outcome = await leaves.decide(ctx, '90000000-0000-4000-8000-000000000001', {
        decision: LeaveDecisionStatus.APPROVED,
        decidedByUserId: 'manager-user',
        expectedVersion: 1,
      });

      // Tek transaction: etki, audit ve outbox AYNI EntityManager örneğini kullanır.
      expect(impact.prepareApprovalImpact.mock.calls[0][0]).toBe(manager);
      expect(impact.prepareApprovalImpact.mock.calls[0][1]).toBe(ctx);
      // Etki, karar yazılmadan ÖNCE bekleyen durumla hesaplanır.
      expect(impactInputs[0]).toEqual({
        version: 1,
        decisionStatus: LeaveDecisionStatus.PENDING,
        coverageStatus: LeaveCoverageStatus.NOT_REQUIRED,
      });
      expect(audit.write.mock.calls[0][0]).toBe(manager);
      expect(manager.query.mock.calls[0][0]).toContain('INSERT INTO leave_outbox_events');
      expect(manager.query.mock.calls[0][1][0]).toBe(
        'leave.approved.v1:90000000-0000-4000-8000-000000000001:v2',
      );
      expect(manager.query.mock.calls[0][1][4]).toMatchObject({
        impactedLessonCount: 3,
        openLessonCount: 3,
        projectionPersisted: true,
      });
      expect(outcome?.leave.coverageStatus).toBe(LeaveCoverageStatus.UNRESOLVED);
      expect(outcome?.leave.decisionStatus).toBe(LeaveDecisionStatus.APPROVED);
      expect(outcome?.leave.version).toBe(2);
      expect(outcome?.impact?.impactedLessonCount).toBe(3);
      expect(audit.write.mock.calls[0][1]).toBe('leave.approved.v1');
      expect(audit.write.mock.calls[0][2].changedFields).toEqual([
        'status',
        'coverageStatus',
        'dailyOperationsProjection',
        'version',
      ]);
    });

    it('does not compute impact for a rejection and keeps coverage untouched', async () => {
      const { leaves, impact, audit, manager } = setup();

      const outcome = await leaves.decide(ctx, '90000000-0000-4000-8000-000000000001', {
        decision: LeaveDecisionStatus.REJECTED,
        decidedByUserId: 'manager-user',
        expectedVersion: 1,
      });

      expect(impact.prepareApprovalImpact).not.toHaveBeenCalled();
      expect(outcome?.impact).toBeNull();
      expect(outcome?.leave.coverageStatus).toBe(LeaveCoverageStatus.NOT_REQUIRED);
      expect(audit.write.mock.calls[0][1]).toBe('leave.rejected.v1');
      expect(manager.query.mock.calls[0][1][4]).toMatchObject({
        impactedLessonCount: null,
        projectionPersisted: false,
      });
    });

    it('propagates an audit failure instead of returning a partially written decision', async () => {
      const failure = new Error('audit insert failed');
      const { leaves, manager } = setup({ auditError: failure });

      await expect(
        leaves.decide(ctx, '90000000-0000-4000-8000-000000000001', {
          decision: LeaveDecisionStatus.APPROVED,
          decidedByUserId: 'manager-user',
          expectedVersion: 1,
        }),
      ).rejects.toBe(failure);
      // Outbox yalnız audit başarılıysa denenir; rollback DB testinde kanıtlanır.
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('rejects a stale version before any impact or audit work', async () => {
      const { leaves, impact, audit } = setup();

      await expect(
        leaves.decide(ctx, '90000000-0000-4000-8000-000000000001', {
          decision: LeaveDecisionStatus.APPROVED,
          decidedByUserId: 'manager-user',
          expectedVersion: 7,
        }),
      ).rejects.toBeInstanceOf(LeaveStaleVersionException);
      expect(impact.prepareApprovalImpact).not.toHaveBeenCalled();
      expect(audit.write).not.toHaveBeenCalled();
    });

    it('rejects a terminal request and returns null for an unknown request', async () => {
      const terminal = setup({ row: { decisionStatus: LeaveDecisionStatus.APPROVED } });
      await expect(terminal.leaves.decide(ctx, '90000000-0000-4000-8000-000000000001', {
        decision: LeaveDecisionStatus.APPROVED,
        decidedByUserId: 'manager-user',
        expectedVersion: 1,
      })).rejects.toBeInstanceOf(LeaveTerminalStateException);
      expect(terminal.audit.write).not.toHaveBeenCalled();

      const missing = setup({ row: null });
      await expect(missing.leaves.decide(ctx, '90000000-0000-4000-8000-000000000001', {
        decision: LeaveDecisionStatus.REJECTED,
        decidedByUserId: 'manager-user',
        expectedVersion: 1,
      })).resolves.toBeNull();
      expect(missing.audit.write).not.toHaveBeenCalled();
    });
  });
});

describe('LeaveRepository create/listOwn (#263 AC-1 / AC-3)', () => {
  const branchId = '30000000-0000-4000-8000-000000000001';
  const teacherId = '20000000-0000-4000-8000-000000000001';

  function createSetup(overlapRows: unknown[] = []) {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM branches')) return [{ '?column?': 1 }];
        if (sql.includes('FROM leave_requests')) return overlapRows;
        return [];
      }),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn(async (_entity: unknown, value: unknown) => ({
        ...(value as Record<string, unknown>),
        id: '90000000-0000-4000-8000-000000000001',
      })),
    };
    const dataSource = { transaction: jest.fn(async (run: any) => run(manager)) };
    const audit = { write: jest.fn(async () => undefined) };
    const leaves = new LeaveRepository({} as any, dataSource as any, audit as any, {} as any);
    return { leaves, manager, audit };
  }

  const values = {
    tenantId: ctx.tenantId!,
    branchId,
    teacherId,
    requesterUserId: '10000000-0000-4000-8000-000000000001',
    durationType: LeaveDurationType.HOURLY,
    reasonCode: LeaveReasonCode.ADMINISTRATIVE,
    coverageStatus: LeaveCoverageStatus.NOT_REQUIRED,
    startsAt: new Date('2026-09-14T07:00:00.000Z'),
    endsAt: new Date('2026-09-14T08:00:00.000Z'),
  };

  it('serializes the overlap check with a transaction-scoped advisory lock', async () => {
    const { leaves, manager } = createSetup();

    await leaves.create(ctx, values);

    const sql = manager.query.mock.calls.map((call) => String(call[0]));
    const lockIndex = sql.findIndex((statement) => statement.includes('pg_advisory_xact_lock'));
    const overlapIndex = sql.findIndex((statement) => statement.includes('FROM leave_requests'));
    expect(lockIndex).toBeGreaterThan(-1);
    expect(overlapIndex).toBeGreaterThan(-1);
    // TOCTOU: kilit, çakışma kontrolünden ÖNCE alınmalı.
    expect(lockIndex).toBeLessThan(overlapIndex);
  });

  it('rejects an overlapping request inside the same transaction', async () => {
    const { leaves, audit } = createSetup([{ '?column?': 1 }]);

    await expect(leaves.create(ctx, values)).rejects.toThrow(/overlaps an existing request/);
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('scopes the own history to tenant and server-resolved teacher', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    };
    const repository = { createQueryBuilder: jest.fn(() => qb) };
    const leaves = new LeaveRepository(repository as any, {} as any, {} as any, {} as any);

    await leaves.listOwn(ctx, { teacherId, decisionStatus: LeaveDecisionStatus.PENDING });

    expect(qb.where).toHaveBeenCalledWith('leave.tenant_id = :tenantId', { tenantId: ctx.tenantId });
    expect(qb.andWhere).toHaveBeenCalledWith('leave.teacher_id = :teacherId', { teacherId });
    expect(qb.andWhere).toHaveBeenCalledWith('leave.decision_status = :decisionStatus', {
      decisionStatus: LeaveDecisionStatus.PENDING,
    });
    expect(qb.orderBy).toHaveBeenCalledWith('leave.starts_at', 'DESC');
  });

  it('reads the tenant time zone scoped by tenant', async () => {
    const repository = { query: jest.fn(async () => [{ timezone: 'Europe/Istanbul' }]) };
    const leaves = new LeaveRepository(repository as any, {} as any, {} as any, {} as any);

    await expect(leaves.loadTenantTimeZone(ctx)).resolves.toBe('Europe/Istanbul');
    expect(repository.query).toHaveBeenCalledWith(
      'SELECT timezone FROM tenants WHERE id = $1 LIMIT 1',
      [ctx.tenantId],
    );
  });
});


