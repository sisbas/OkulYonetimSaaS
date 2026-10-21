import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { DuplicateStrategicGoalException, StrategicGoalService } from './strategic-goal.service';
import { StrategicGoal, } from './strategic-goal.entity';

const TENANT_A = '00000000-0000-4000-8000-000000000001';
const TENANT_B = '00000000-0000-4000-8000-000000000002';
const ADMIN_USER = '10000000-0000-4000-8000-000000000001';

const ctx: RequestContext = {
  requestId: 'req-1',
  tenantId: TENANT_A,
  user: {
    userId: ADMIN_USER,
    tenantId: TENANT_A,
    roleIds: ['tenant_admin'],
    permissions: ['strategic_goal:manage'],
  },
};

function goalRow(overrides: Partial<StrategicGoal> = {}): StrategicGoal {
  return {
    id: '90000000-0000-4000-8000-000000000001',
    tenantId: TENANT_A,
    academicYear: '2026-2027',
    metricKey: 'graduation_rate',
    metricLabel: 'Mezuniyet oranı',
    targetValue: 90,
    progressValue: null,
    createdByUserId: ADMIN_USER,
    deletedAt: null,
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    updatedAt: new Date('2026-10-01T08:00:00.000Z'),
    ...overrides,
  } as StrategicGoal;
}

type RepoStub = {
  create: jest.Mock;
  list: jest.Mock;
  findActive: jest.Mock;
  findActiveByYearAndMetric: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
};

function makeRepo(): RepoStub {
  return {
    create: jest.fn(),
    list: jest.fn(async () => []),
    findActive: jest.fn(async () => null),
    findActiveByYearAndMetric: jest.fn(async () => null),
    update: jest.fn(async () => undefined),
    softDelete: jest.fn(async () => undefined),
  };
}

describe('StrategicGoalService (#457)', () => {
  it('creates a goal with manual target and empty progress', async () => {
    const repo = makeRepo();
    repo.create.mockImplementation(async (_ctx, values) => {
      expect(values).toMatchObject({
        tenantId: TENANT_A,
        academicYear: '2026-2027',
        metricKey: 'graduation_rate',
        targetValue: 90,
        progressValue: null,
        createdByUserId: ADMIN_USER,
      });
      return goalRow({ metricLabel: 'Mezuniyet oranı' });
    });
    const service = new StrategicGoalService(repo as never);

    const response = await service.create(ctx, {
      academicYear: '2026-2027',
      metricKey: ' graduation_rate ',
      metricLabel: 'Mezuniyet oranı',
      targetValue: 90,
    });

    expect(response).toMatchObject({
      academicYear: '2026-2027',
      metricKey: 'graduation_rate',
      targetValue: 90,
      progressValue: null,
    });
  });

  it('refuses a second target for the same metric and year with a reason (AC)', async () => {
    const repo = makeRepo();
    repo.findActiveByYearAndMetric.mockResolvedValue(goalRow());
    const service = new StrategicGoalService(repo as never);

    await expect(
      service.create(ctx, { academicYear: '2026-2027', metricKey: 'graduation_rate', targetValue: 95 }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        reason: 'duplicate_metric_year',
      },
    });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.findActiveByYearAndMetric).toHaveBeenCalledWith(ctx, '2026-2027', 'graduation_rate');
  });

  it('treats the same metric in a different academic year as a new goal', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue(goalRow({ academicYear: '2027-2028' }));
    const service = new StrategicGoalService(repo as never);

    await expect(
      service.create(ctx, { academicYear: '2027-2028', metricKey: 'graduation_rate', targetValue: 92 }),
    ).resolves.toMatchObject({ academicYear: '2027-2028' });
    // Farklı yılda duplicate kontrolü o yıla karşı yapılır.
    expect(repo.findActiveByYearAndMetric).toHaveBeenCalledWith(ctx, '2027-2028', 'graduation_rate');
  });

  it('maps a unique-index race violation to the same duplicate reason', async () => {
    const repo = makeRepo();
    // Gerçek sürücü hatası biçimi: TypeORM QueryFailedError + pg hata alanları.
    repo.create.mockRejectedValue(
      new QueryFailedError(
        'INSERT INTO strategic_goals () VALUES ()',
        [],
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_strategic_goals_tenant_year_metric',
        }),
      ),
    );
    const service = new StrategicGoalService(repo as never);

    const error = await service.create(ctx, {
      academicYear: '2026-2027',
      metricKey: 'graduation_rate',
      targetValue: 90,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ reason: 'duplicate_metric_year' });
  });

  it('keeps reads and writes inside the caller tenant (BOLA: cross-tenant detail is 404)', async () => {
    const repo = makeRepo();
    repo.findActive.mockResolvedValue(null);
    const service = new StrategicGoalService(repo as never);

    await expect(service.get(ctx, '90000000-0000-4000-8000-000000000001')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Repo sorgusuna çağıranın tenantId'si geçilir; istemci tenant seçemez.
    expect(repo.findActive).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      '90000000-0000-4000-8000-000000000001',
    );
  });

  it('applies a tenant-year filter when listing', async () => {
    const repo = makeRepo();
    repo.list.mockResolvedValue([goalRow()]);
    const service = new StrategicGoalService(repo as never);

    const rows = await service.list(ctx, { academicYear: '2026-2027' });

    expect(rows).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith(ctx, '2026-2027');
  });

  it('updates target and progress for an existing goal', async () => {
    const repo = makeRepo();
    repo.findActive.mockResolvedValue(goalRow({ progressValue: 45 }));
    const service = new StrategicGoalService(repo as never);

    const response = await service.update(ctx, '90000000-0000-4000-8000-000000000001', {
      targetValue: 92,
      progressValue: 46,
    });

    expect(response).toMatchObject({ targetValue: 90, progressValue: 45 });
    expect(repo.update).toHaveBeenCalledWith(ctx, '90000000-0000-4000-8000-000000000001', {
      targetValue: 92,
      progressValue: 46,
      metricLabel: undefined,
    });
  });

  it('refuses an update with no fields', async () => {
    const service = new StrategicGoalService(makeRepo() as never);

    await expect(
      service.update(ctx, '90000000-0000-4000-8000-000000000001', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-deletes without touching other tenants', async () => {
    const repo = makeRepo();
    const service = new StrategicGoalService(repo as never);

    await service.delete(ctx, '90000000-0000-4000-8000-000000000001');

    expect(repo.softDelete).toHaveBeenCalledWith(ctx, '90000000-0000-4000-8000-000000000001');
  });

  it('rejects a metric key that is blank after trimming', async () => {
    const repo = makeRepo();
    const service = new StrategicGoalService(repo as never);

    await expect(
      service.create(ctx, { academicYear: '2026-2027', metricKey: '   ', targetValue: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exposes the duplicate exception as a typed ConflictException class', () => {
    expect(new DuplicateStrategicGoalException('2026-2027', 'graduation_rate')).toBeInstanceOf(
      ConflictException,
    );
  });
});
