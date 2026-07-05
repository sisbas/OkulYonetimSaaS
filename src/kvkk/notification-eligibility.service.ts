import { ChannelGuard } from './channel.guard';
import { ConsentGuard } from './consent.guard';
import { NotificationApprovalGuard, NOT_APPROVED } from './notification-approval.guard';
import { PhoneGuard } from './phone.guard';
import {
  NotificationEligibilityInput,
  NotificationResult,
  NotificationSendInput,
} from './types';

export class NotificationEligibilityService {
  constructor(
    private readonly consentGuard = new ConsentGuard(),
    private readonly phoneGuard = new PhoneGuard(),
    private readonly channelGuard = new ChannelGuard(),
    private readonly approvalGuard = new NotificationApprovalGuard(),
  ) {}

  evaluate(input: NotificationEligibilityInput): NotificationResult {
    if (!this.consentGuard.canProcess(input.consent)) {
      return { status: 'blocked_consent', message_body: null };
    }

    if (!this.phoneGuard.hasPhone(input.phone)) {
      return { status: 'blocked_phone', message_body: null };
    }

    if (!this.phoneGuard.isVerified(input.phone)) {
      return { status: 'blocked_phone_unverified', message_body: null };
    }

    if (!this.channelGuard.canUseChannel(input.channel)) {
      return { status: 'blocked_channel', message_body: null };
    }

    return { status: 'approved', message_body: input.messageBody };
  }

  async send(input: NotificationSendInput): Promise<NotificationResult> {
    const approval = this.approvalGuard.canSend(input.notification);
    if (approval !== true) {
      return { status: input.notification.status, message_body: null, reason: NOT_APPROVED };
    }

    const eligibility = this.evaluate({
      consent: input.consent,
      phone: input.phone,
      channel: input.channel,
      messageBody: input.notification.messageBody,
    });

    if (eligibility.status !== 'approved' || eligibility.message_body === null) {
      return eligibility;
    }

    await input.queue.enqueue({
      notificationId: input.notification.id,
      subjectId: input.notification.subjectId,
      channel: input.notification.channel,
      messageBody: eligibility.message_body,
    });

    return { status: 'sent', message_body: eligibility.message_body };
  }
}
