import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';

import { RequestWithContext } from '../common/context/request-context';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { DailyOperationsQueueController } from './daily-operations.controller';
import { DailyOperationsService } from './daily-operations.service';

describe('Daily operations read controller contract (#461 F2)', () => {
  const service = {
    today: jest.fn(),
    day: jest.fn(),
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
