import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationChannel,
  NotificationEligibilityInput,
  NotificationStatus,
  ProviderJob,
  ProviderJobQueue,
} from '../kvkk/types';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { redactNotificationPayload } from '../kvkk/notification-payload-redaction';
import { NotificationLog } from './notification-log.entity';

/** Veliye bildirim gönderme girdi sözleşmesi (OKUL-08). */
export interface SendToParentInput {
  /** Bildirimi başlatan kiracı (tenant). */
  tenantId: string;
  /** Bildirim kayıt kimliği (idempotency + log eşlemesi için). */
  notificationId: string;
  /** Bildirimin hedefi olan veli/öğrenci subject kimliği. */
  subjectId: string;
  channel: NotificationChannel;
  /** Bildirim başlangıç durumu (KVKK onay akışına göre 'approved' beklenir). */
  status: NotificationStatus;
  /** Ham mesaj gövdesi — KVKK gereği kaydedilmeden ÖNCE maskelenir. */
  messageBody: string | null;
  /** Onay/izin girdi seti (consent + phone + channel). */
  eligibility: NotificationEligibilityInput;
  /** Provider kuyruğu — test'te mock enqueue sağlanır. */
  queue: ProviderJobQueue;
}

/**
 * Veli Bildirim Servisi (OKUL-08).
 *
 * Sorumluluklar:
 *  1. NotificationEligibilityService.evaluate() ile consent+phone+channel kontrolü.
 *  2. Onaylıysa: messageBody'yi redactNotificationPayload ile maskele (KVKK).
 *  3. ProviderJobQueue'ya enqueue et (mock queue test'te).
 *  4. NotificationLog kaydı oluştur (masked payload).
 *  5. Audit: struktured log (tenantId + subjectId).
 *
 * Tüm PII ham halde saklanmaz; log yalnızca maskelenmiş gövde taşır.
 */
@Injectable()
export class ParentNotificationService {
  private readonly logger = new Logger(ParentNotificationService.name);

  constructor(
    @InjectRepository(NotificationLog)
    private readonly repo: Repository<NotificationLog>,
    private readonly eligibilityService: NotificationEligibilityService,
  ) {}

  async sendToParent(input: SendToParentInput): Promise<NotificationStatus> {
    const { tenantId, subjectId, channel, notificationId } = input;

    // 0) KVKK onay akışı: yalnızca 'approved' durumundaki bildirim gönderilir.
    // Draft veya diğer durumlar enqueue EDİLMEZ (NotificationEligibilityService.send
    // onay guard'ını bypass etmemek için).
    if (input.status !== 'approved') {
      await this.persistLog({
        tenantId,
        subjectId,
        channel,
        notificationId,
        status: input.status,
        maskedBody: null,
        reason: 'not_approved',
      });
      this.audit(tenantId, subjectId, input.status, 'status_not_approved');
      return input.status;
    }

    // 1) Uygunluk değerlendirmesi (consent + phone + channel).
    const result = this.eligibilityService.evaluate({
      consent: input.eligibility.consent,
      phone: input.eligibility.phone,
      channel: input.eligibility.channel,
      messageBody: input.messageBody,
    });

    // 2) Onaylı değilse log kaydı (maskeli/boş gövde) + audit, gönderim yok.
    if (result.status !== 'approved' || result.message_body === null) {
      await this.persistLog({
        tenantId,
        subjectId,
        channel,
        notificationId,
        status: result.status,
        maskedBody: null,
        reason: result.reason ?? 'eligibility_failed',
      });
      this.audit(tenantId, subjectId, result.status, 'eligibility_rejected');
      return result.status;
    }

    // 3) KVKK: ham gövdeyi maskele, ham halde diske YAZMA.
    const masked = redactNotificationPayload({
      messageBody: result.message_body,
      channel,
    }) as { messageBody?: string };
    const maskedBody = masked.messageBody ?? '[REDACTED]';

    // 4) Provider kuyruğuna enqueue.
    const job: ProviderJob = {
      notificationId,
      subjectId,
      channel,
      messageBody: result.message_body,
    };
    await input.queue.enqueue(job);

    // 5) NotificationLog kaydı (maskeli payload).
    await this.persistLog({
      tenantId,
      subjectId,
      channel,
      notificationId,
      status: 'sent',
      maskedBody,
      reason: null,
    });

    this.audit(tenantId, subjectId, 'sent', 'enqueued');
    return 'sent';
  }

  /** NotificationLog kaydını idempotent biçimde yazar (upsert). */
  private async persistLog(params: {
    tenantId: string;
    subjectId: string;
    channel: NotificationChannel;
    notificationId: string;
    status: NotificationStatus;
    maskedBody: string | null;
    reason: string | null;
  }): Promise<void> {
    await this.repo.upsert(
      this.repo.create({
        tenantId: params.tenantId,
        subjectId: params.subjectId,
        channel: params.channel,
        notificationId: params.notificationId,
        status: params.status,
        messageBodyMasked: params.maskedBody,
        reason: params.reason,
      }),
      { conflictPaths: ['tenantId', 'notificationId'] },
    );
  }

  /** KVKK/audit: tenantId + subjectId içeren struktured log. */
  private audit(
    tenantId: string,
    subjectId: string,
    status: NotificationStatus,
    outcome: string,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'parent_notification.processed',
        tenantId,
        subjectId,
        status,
        outcome,
      }),
    );
  }
}
