import { ChannelGuard } from './channel.guard';
import { ConsentGuard } from './consent.guard';
import { NotificationApprovalGuard } from './notification-approval.guard';
import { LegacySendQuarantinedError } from './legacy-send-quarantined.error';
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

  /** Legacy execution is denied independently of caller-supplied eligibility. */
  async send(_input: NotificationSendInput): Promise<NotificationResult> {
    throw new LegacySendQuarantinedError();
  }
}
