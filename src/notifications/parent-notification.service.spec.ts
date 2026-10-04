import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ParentNotificationService, SendToParentInput } from './parent-notification.service';
import { NotificationLog } from './notification-log.entity';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { redactNotificationPayload } from '../kvkk/notification-payload-redaction';

describe('ParentNotificationService N0 quarantine', () => {
  it.each(['pending', 'approved', 'revoked'] as const)('denies %s consent without mutation', async (status) => {
    const repo = { create: jest.fn(), upsert: jest.fn() };
    const queue = { enqueue: jest.fn() };
    const module = await Test.createTestingModule({ providers: [ParentNotificationService,
      { provide: getRepositoryToken(NotificationLog), useValue: repo },
      { provide: NotificationEligibilityService, useClass: NotificationEligibilityService }],
    }).compile();
    const input: SendToParentInput = { tenantId: 'untrusted', notificationId: 'untrusted',
      subjectId: 'raw-subject', channel: 'sms', status: 'approved', messageBody: 'raw-message',
      eligibility: { consent: { status }, phone: { exists: true, verified: true },
        channel: { channel: 'sms', allowed: true }, messageBody: 'raw-message' }, queue };
    await expect(module.get(ParentNotificationService).sendToParent(input))
      .rejects.toThrow(/^NOTIFICATION_LEGACY_SEND_QUARANTINED$/);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
    await module.close();
  });

  it('retains payload redaction at its pure seam', () => {
    expect(redactNotificationPayload({ messageBody: 'raw-contact', channel: 'sms' }))
      .toEqual({ messageBody: '[REDACTED]', channel: 'sms' });
  });
});
