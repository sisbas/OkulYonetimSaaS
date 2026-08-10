import { RequestContext } from '../common/context/request-context';
import { LeaveRepository } from './leave.repository';

const ctx: RequestContext = {
  requestId: 'req-1',
  tenantId: '00000000-0000-4000-8000-000000000001',
};

describe('LeaveRepository', () => {
  it('scopes own leave reads by tenant, teacher, and resolved branch', async () => {
    const repository = { findOne: jest.fn(async () => null) };
    const leaves = new LeaveRepository(repository as any, {} as any, {} as any);

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
});
