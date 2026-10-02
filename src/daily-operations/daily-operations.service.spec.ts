import { BadRequestException } from '@nestjs/common';
import { DailyOperationsService } from './daily-operations.service';
import { DailyOperationsRepository } from './daily-operations.repository';
import { RequestContext } from '../common/context/request-context';

describe('daily queue calendar input boundary (#263)', () => {
  const context: RequestContext = { tenantId: 'tenant', requestId: 'calendar-boundary' };
  const today = jest.fn().mockResolvedValue({ lessons: [] });
  const service = new DailyOperationsService({ today } as unknown as DailyOperationsRepository);

  beforeEach(() => today.mockClear());

  it.each(['2026-02-30', '2026-02-29', '2100-02-29', '2026-04-31',
    '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01',
    '2026-9-30', '2026-09-30T00:00:00Z', 'not-a-date'])
  ('rejects invalid calendar input %s before touching storage', async (date) => {
    await expect(service.today(context, { branchId: 'branch', date }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(today).not.toHaveBeenCalled();
  });

  it.each(['2024-02-29', '2000-02-29', '2026-09-30', '0001-01-01', '9999-12-31'])
  ('preserves valid calendar input %s without timezone normalization', async (date) => {
    await service.today(context, { branchId: 'branch', date });
    expect(today).toHaveBeenCalledWith(context, { branchId: 'branch', date });
  });

  it('uses the authoritative context business date without interpreting it as an instant', async () => {
    const scoped: RequestContext = {
      ...context, businessDate: { tenantId: 'tenant', date: '2024-02-29', source: 'tenant_local' },
    };
    await service.today(scoped, { branchId: 'branch' });
    expect(today).toHaveBeenCalledWith(scoped, { branchId: 'branch', date: '2024-02-29' });
  });

  it('propagates dependency failure instead of claiming an empty successful queue', async () => {
    const failure = new Error('synthetic dependency outage');
    today.mockRejectedValueOnce(failure);
    await expect(service.today(context, { branchId: 'branch', date: '2026-09-30' }))
      .rejects.toBe(failure);
  });
});
