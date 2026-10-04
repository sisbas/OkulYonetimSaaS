import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationEligibilityInput, NotificationStatus, ProviderJobQueue } from '../kvkk/types';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { LegacySendQuarantinedError } from '../kvkk/legacy-send-quarantined.error';
import { resolvePseudonymKey } from '../kvkk/pseudonym';
import { NotificationLog } from './notification-log.entity';

/** Legacy signature retained for controlled denial; input conveys no authority. */
export interface SendToParentInput {
  tenantId: string;
  notificationId: string;
  subjectId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  messageBody: string | null;
  eligibility: NotificationEligibilityInput;
  queue: ProviderJobQueue;
}

/** N0 quarantine. Future dispatch must use the canonical transactional outbox. */
@Injectable()
export class ParentNotificationService {
  constructor(
    @InjectRepository(NotificationLog)
    private readonly repo: Repository<NotificationLog>,
    private readonly eligibilityService: NotificationEligibilityService,
  ) {
    resolvePseudonymKey();
  }

  async sendToParent(_input: SendToParentInput): Promise<NotificationStatus> {
    throw new LegacySendQuarantinedError();
  }
}
