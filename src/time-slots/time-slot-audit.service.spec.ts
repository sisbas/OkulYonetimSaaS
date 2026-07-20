import { Logger } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { TimeSlotAuditService } from './time-slot-audit.service';

const FORBIDDEN = ['requestBody', 'responseBody', 'authorization', 'token', 'cookie', 'credential', 'password', 'errorPayload'];

describe('TimeSlotAuditService allowlist', () => {
  const ctx: RequestContext = {
    requestId: 'req-1', tenantId: 'tenant-a',
    user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['admin'], permissions: ['time_slot:create'] },
  };

  it('emits lifecycle events with allowlisted metadata only', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = new TimeSlotAuditService();
    const event = service.emit(ctx, 'time_slot.created', {
      timeSlotId: 'slot-1', branchId: 'branch-a', changedFields: ['name', 'startTime'],
    });
    expect(event).toMatchObject({ eventName: 'time_slot.created', tenantId: 'tenant-a', actorId: 'user-1', result: 'success' });
    const serialized = String(log.mock.calls[0][0]);
    for (const key of FORBIDDEN) expect(serialized).not.toContain(key);
    log.mockRestore();
  });

  it('emits non-enumerating denied events without raw payloads', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new TimeSlotAuditService();
    const event = service.emitAccessDenied(ctx, { timeSlotId: 'opaque-id', reasonCode: 'time_slot_not_visible' });
    expect(event).toMatchObject({ eventName: 'time_slot.access_denied', result: 'denied', reasonCode: 'time_slot_not_visible' });
    const serialized = String(warn.mock.calls[0][0]);
    for (const key of FORBIDDEN) expect(serialized).not.toContain(key);
    warn.mockRestore();
  });
});
