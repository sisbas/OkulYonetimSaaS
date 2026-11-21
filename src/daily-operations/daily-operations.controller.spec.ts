import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';

import { RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { DailyOperationsController, DailyOperationsQueueController } from './daily-operations.controller';
import { DailyOperationsService } from './daily-operations.service';

describe('Daily operations read controller contract (#461 F2)', () => {
  const service = {
    today: jest.fn(),
    day: jest.fn(),
    impact: jest.fn(),
  } as unknown as DailyOperationsService;

  it('maps both read surfaces to the seeded daily_operations:read permission', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        DailyOperationsQueueController.prototype.today,
      ),
    ).toEqual(['daily_operations:read']);
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        DailyOperationsQueueController.prototype.day,
      ),
    ).toEqual(['daily_operations:read']);
  });

  it('refuses the day read without an authenticated tenant context', () => {
    const controller = new DailyOperationsQueueController(service);
    expect(() =>
      controller.day(
        { context: { requestId: 'req-1' } } as RequestWithContext,
        {},
      ),
    ).toThrow(UnauthorizedException);
  });
});

describe('#455 impact endpoint contract', () => {
  const impact = jest.fn().mockResolvedValue({ todayLessonCount: 0 });
  const service = { impact } as unknown as DailyOperationsService;
  const controller = new DailyOperationsController(service);
  const request = {
    context: {
      tenantId: 'tenant',
      requestId: 'req-1',
      user: { userId: 'user-1', tenantId: 'tenant' },
    },
  } as unknown as RequestWithContext;

  beforeEach(() => impact.mockClear());

  it('uses the impact-read permission, not the daily queue permission', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        DailyOperationsController.prototype.impact,
      ),
    ).toEqual(['leave:impact:read']);
  });

  it('forwards the optional operational date to the service', () => {
    controller.impact(request, '22222222-2222-4222-8222-222222222222', '2026-11-23');
    expect(impact).toHaveBeenCalledWith(
      request.context,
      '22222222-2222-4222-8222-222222222222',
      '2026-11-23',
    );
  });

  it('leaves the date undefined when the client does not send one', () => {
    controller.impact(request, '22222222-2222-4222-8222-222222222222');
    expect(impact).toHaveBeenCalledWith(
      request.context,
      '22222222-2222-4222-8222-222222222222',
      undefined,
    );
  });

  it('refuses an unauthenticated impact read', () => {
    expect(() =>
      controller.impact(
        { context: { requestId: 'req-1' } } as RequestWithContext,
        '22222222-2222-4222-8222-222222222222',
      ),
    ).toThrow(UnauthorizedException);
  });
});
