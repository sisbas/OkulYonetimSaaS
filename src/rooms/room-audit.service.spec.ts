import { Logger } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { RoomAuditService } from './room-audit.service';

const FORBIDDEN_KEYS = [
  'requestBody',
  'responseBody',
  'authorization',
  'cookie',
  'token',
  'password',
  'credential',
  'email',
  'phone',
  'parentPhone',
  'parentEmail',
  'guardianContact',
  'providerResponse',
  'messageBody',
  'notificationPayload',
  'guidanceNote',
  'studentName',
  'parentName',
  'teacherName',
  'description',
  'search',
];

describe('RoomAuditService', () => {
  const ctx: RequestContext = {
    requestId: 'req-1',
    tenantId: 'tenant-a',
    user: { userId: 'user-1', tenantId: 'tenant-a', roleIds: ['role-admin'], permissions: ['room:create'] },
  };

  it('emits room audit events with allowlisted metadata only', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = new RoomAuditService();

    const event = service.emit(ctx, 'room.created', { roomId: 'room-1', branchId: 'branch-a', changedFields: ['description', 'name'] });

    expect(event).toMatchObject({ eventName: 'room.created', resource: 'room', tenantId: 'tenant-a', branchId: 'branch-a', actorId: 'user-1' });
    const serialized = String(logSpy.mock.calls[0][0]);
    expect(serialized).toContain('room.created');
    for (const forbidden of FORBIDDEN_KEYS.filter((key) => key !== 'description')) {
      expect(serialized).not.toContain(forbidden);
    }
    logSpy.mockRestore();
  });

  it('emits tenant.access_denied with allowlisted metadata only', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new RoomAuditService();

    const event = service.emitTenantAccessDenied(ctx, { roomId: 'room-from-tenant-b' });

    expect(event).toEqual({
      eventName: 'tenant.access_denied',
      tenantId: 'tenant-a',
      actorId: 'user-1',
      requestId: 'req-1',
      resource: 'room',
      roomId: 'room-from-tenant-b',
      changedFields: [],
      result: 'denied',
    });
    const serialized = String(warnSpy.mock.calls[0][0]);
    expect(serialized).toContain('tenant.access_denied');
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(serialized).not.toContain(forbidden);
    }
    warnSpy.mockRestore();
  });
});
