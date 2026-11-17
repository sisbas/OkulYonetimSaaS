import { BadRequestException, NotFoundException } from '@nestjs/common';
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

describe('daily operations day surface (#461 F2)', () => {
  const context: RequestContext = {
    tenantId: 'tenant',
    branchId: 'server-branch',
    requestId: 'day-surface',
  };
  const day = jest.fn().mockResolvedValue({ lessons: [], stats: {} });
  const service = new DailyOperationsService({ day } as unknown as DailyOperationsRepository);

  beforeEach(() => day.mockClear());

  it('uses the explicit branch selection when the client sends one', async () => {
    await service.day(context, { branchId: 'client-branch', date: '2026-11-02' });
    expect(day).toHaveBeenCalledWith(context, {
      branchId: 'client-branch',
      date: '2026-11-02',
    });
  });

  it('falls back to the server-resolved active branch when branchId is omitted', async () => {
    await service.day(context, { date: '2026-11-02' });
    expect(day).toHaveBeenCalledWith(context, {
      branchId: 'server-branch',
      date: '2026-11-02',
    });
  });

  it('rejects a request with neither a client branch nor a resolved branch', async () => {
    await expect(
      service.day({ tenantId: 'tenant', requestId: 'no-branch' }, { date: '2026-11-02' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(day).not.toHaveBeenCalled();
  });

  it.each(['2026-02-30', '2026-13-01', 'not-a-date'])(
    'rejects invalid day calendar input %s before touching storage',
    async (date) => {
      await expect(service.day(context, { date })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(day).not.toHaveBeenCalled();
    },
  );

  it('maps a branch outside the tenant to a non-enumerating 404', async () => {
    day.mockRejectedValueOnce(new Error('BRANCH_NOT_VISIBLE'));
    await expect(
      service.day(context, { branchId: 'branch-other', date: '2026-11-02' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
