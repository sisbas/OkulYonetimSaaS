import {
  ChannelGuard,
  ConsentGuard,
  ConsentStatus,
  NOT_APPROVED,
  NotificationApprovalGuard,
  NotificationEligibilityService,
  NotificationInput,
  PhoneGuard,
  ProviderJobQueue,
} from '../../src/kvkk';

const approvedNotification: NotificationInput = {
  id: 'notification-1',
  subjectId: 'parent-1',
  channel: 'sms',
  status: 'approved',
  messageBody: 'Your student was absent today.',
};

const verifiedPhone = { exists: true, verified: true };
const allowedChannel = { channel: 'sms', allowed: true };

const createQueue = (): ProviderJobQueue & { enqueue: jest.Mock } => ({
  enqueue: jest.fn(),
});

describe('KVKK consent guard CG-001-CG-012', () => {
  it('CG-001 allows processing when consent is approved', () => {
    expect(new ConsentGuard().canProcess({ status: 'approved' })).toBe(true);
  });

  it.each<ConsentStatus>(['pending', 'rejected', 'revoked'])(
    'CG-002 blocks %s consent and clears message body',
    (status) => {
      const result = new NotificationEligibilityService().evaluate({
        consent: { status },
        phone: verifiedPhone,
        channel: allowedChannel,
        messageBody: 'Sensitive notification text',
      });

      expect(result).toEqual({ status: 'blocked_consent', message_body: null });
    },
  );

  it('CG-003 blocks missing consent and clears message body', () => {
    const result = new NotificationEligibilityService().evaluate({
      consent: null,
      phone: verifiedPhone,
      channel: allowedChannel,
      messageBody: 'Sensitive notification text',
    });

    expect(result.status).toBe('blocked_consent');
    expect(result.message_body).toBeNull();
  });

  it('CG-004 does not enqueue provider jobs when consent is missing', async () => {
    const queue = createQueue();

    const result = await new NotificationEligibilityService().send({
      notification: approvedNotification,
      consent: null,
      phone: verifiedPhone,
      channel: allowedChannel,
      queue,
    });

    expect(result).toEqual({ status: 'blocked_consent', message_body: null });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('CG-005 blocks missing phone numbers', () => {
    const result = new NotificationEligibilityService().evaluate({
      consent: { status: 'approved' },
      phone: { exists: false, verified: false },
      channel: allowedChannel,
      messageBody: 'Sensitive notification text',
    });

    expect(new PhoneGuard().hasPhone({ exists: false, verified: false })).toBe(false);
    expect(result).toEqual({ status: 'blocked_phone', message_body: null });
  });

  it('CG-006 blocks unverified phone numbers', () => {
    const result = new NotificationEligibilityService().evaluate({
      consent: { status: 'approved' },
      phone: { exists: true, verified: false },
      channel: allowedChannel,
      messageBody: 'Sensitive notification text',
    });

    expect(new PhoneGuard().canUsePhone({ exists: true, verified: false })).toBe(false);
    expect(result).toEqual({ status: 'blocked_phone_unverified', message_body: null });
  });

  it('CG-007 blocks disallowed channels', () => {
    const channel = { channel: 'whatsapp', allowed: false };

    const result = new NotificationEligibilityService().evaluate({
      consent: { status: 'approved' },
      phone: verifiedPhone,
      channel,
      messageBody: 'Sensitive notification text',
    });

    expect(new ChannelGuard().canUseChannel(channel)).toBe(false);
    expect(result).toEqual({ status: 'blocked_channel', message_body: null });
  });

  it('CG-008 keeps the message body only when all eligibility gates pass', () => {
    const result = new NotificationEligibilityService().evaluate({
      consent: { status: 'approved' },
      phone: verifiedPhone,
      channel: allowedChannel,
      messageBody: 'Allowed notification text',
    });

    expect(result).toEqual({ status: 'approved', message_body: 'Allowed notification text' });
  });

  it('CG-009 returns NOT_APPROVED when trying to send a draft notification', async () => {
    const queue = createQueue();

    const result = await new NotificationEligibilityService().send({
      notification: { ...approvedNotification, status: 'draft' },
      consent: { status: 'approved' },
      phone: verifiedPhone,
      channel: allowedChannel,
      queue,
    });

    expect(new NotificationApprovalGuard().canSend({ status: 'draft' })).toBe(NOT_APPROVED);
    expect(result).toEqual({ status: 'draft', message_body: null, reason: NOT_APPROVED });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('CG-010 re-checks consent before send and blocks revoked consent', async () => {
    const queue = createQueue();

    const result = await new NotificationEligibilityService().send({
      notification: approvedNotification,
      consent: { status: 'revoked' },
      phone: verifiedPhone,
      channel: allowedChannel,
      queue,
    });

    expect(result).toEqual({ status: 'blocked_consent', message_body: null });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('CG-011 enqueues one provider job and marks sent when send gates pass', async () => {
    const queue = createQueue();

    const result = await new NotificationEligibilityService().send({
      notification: approvedNotification,
      consent: { status: 'approved' },
      phone: verifiedPhone,
      channel: allowedChannel,
      queue,
    });

    expect(result).toEqual({ status: 'sent', message_body: approvedNotification.messageBody });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith({
      notificationId: 'notification-1',
      subjectId: 'parent-1',
      channel: 'sms',
      messageBody: approvedNotification.messageBody,
    });
  });

  it('CG-012 does not enqueue when consent is approved but channel becomes blocked before send', async () => {
    const queue = createQueue();

    const result = await new NotificationEligibilityService().send({
      notification: approvedNotification,
      consent: { status: 'approved' },
      phone: verifiedPhone,
      channel: { channel: 'sms', allowed: false },
      queue,
    });

    expect(result).toEqual({ status: 'blocked_channel', message_body: null });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
