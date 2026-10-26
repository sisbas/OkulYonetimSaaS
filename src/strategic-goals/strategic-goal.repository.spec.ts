import { RequestContext } from '../common/context/request-context';
import { StrategicGoalRepository } from './strategic-goal.repository';

const ctx: RequestContext = {
  requestId: 'req-1',
  tenantId: '00000000-0000-4000-8000-000000000001',
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    tenantId: '00000000-0000-4000-8000-000000000001',
    roleIds: ['tenant_admin'],
    permissions: ['strategic_goal:manage'],
  },
};

function makeRepository() {
  return {
    create: jest.fn((values: unknown) => values),
    save: jest.fn(async (values: unknown) => values),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

describe('StrategicGoalRepository (#457)', () => {
  it('derives tenantId from the request context instead of the values payload', async () => {
    const repository = makeRepository();
    const repo = new StrategicGoalRepository(repository as never);

    await repo.create(ctx, {
      academicYear: '2026-2027',
      metricKey: 'graduation_rate',
      metricLabel: null,
      targetValue: 90,
      progressValue: null,
      createdByUserId: null,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: ctx.tenantId }),
    );
    expect(repository.save).toHaveBeenCalled();
  });

  it('reports soft-delete not-found as false so the service can return 404', async () => {
    const repository = makeRepository();
    repository.update.mockResolvedValue({ affected: 0 });
    const repo = new StrategicGoalRepository(repository as never);

    await expect(repo.softDelete(ctx, '90000000-0000-4000-8000-000000000099')).resolves.toBe(false);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: '90000000-0000-4000-8000-000000000099', tenantId: ctx.tenantId }),
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });
});
