import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { NotificationStatus } from '../kvkk/types';
import { ParentNotificationService, SendToParentInput } from './parent-notification.service';
import { NotificationLog } from './notification-log.entity';

describe('N0 legacy send quarantine (non-acceptance regression)', () => {
  const code = 'NOTIFICATION_LEGACY_SEND_QUARANTINED';
  it.each<NotificationStatus>(['approved', 'draft', 'blocked_consent', 'sent'])('%s cannot execute either legacy send seam', async (status) => {
    const repo = { create: jest.fn(), upsert: jest.fn(), save: jest.fn() };
    const queue = { enqueue: jest.fn() };
    const eligibility = new NotificationEligibilityService();
    const module = await Test.createTestingModule({ providers: [ParentNotificationService,
      { provide: getRepositoryToken(NotificationLog), useValue: repo },
      { provide: NotificationEligibilityService, useValue: eligibility }],
    }).compile();
    const input: SendToParentInput = { tenantId: 'untrusted-tenant', notificationId: 'untrusted-id',
      subjectId: 'raw-subject', channel: 'sms', status, messageBody: 'raw-contact-and-message',
      eligibility: { consent: { status: 'approved' }, phone: { exists: true, verified: true },
        channel: { channel: 'sms', allowed: true }, messageBody: 'raw-contact-and-message' }, queue };
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const evaluate = jest.spyOn(eligibility, 'evaluate');
    try {
      for (const execute of [() => module.get(ParentNotificationService).sendToParent(input),
        () => eligibility.send({ ...input.eligibility, queue, notification: {
          id: input.notificationId, subjectId: input.subjectId, channel: input.channel,
          status, messageBody: input.messageBody } })]) {
        await expect(execute()).rejects.toThrow(code);
      }
      expect(queue.enqueue).not.toHaveBeenCalled();
      for (const mutation of Object.values(repo)) expect(mutation).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); await module.close(); }
  });

  it('does not inspect malformed runtime input or disclose caller payload in denial', async () => {
    const service = new NotificationEligibilityService();
    const input = new Proxy({} as Parameters<typeof service.send>[0], {
      get: () => { throw new Error('raw-provider-payload'); },
    });
    await expect(service.send(input)).rejects.toThrow(/^NOTIFICATION_LEGACY_SEND_QUARANTINED$/);
  });
});
