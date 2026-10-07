import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from './notification-log.entity';
import { NotificationOutboxItem } from './notification-outbox.entity';
import { NotificationDispatchReceipt } from './notification-dispatch-receipt.entity';
import { ParentNotificationService } from './parent-notification.service';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { NotificationDispatchRepository } from './notification-dispatch.repository';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationSimulatorService } from './notification-simulator.service';
import { AbsenceNotificationService } from './absence-notification.service';
import { TransactionalAbsenceNotificationAdapter } from './absence-notification.adapter';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { ATTENDANCE_ABSENCE_NOTIFICATION_PORT } from '../attendance/attendance-absence-notification.port';
import { NotificationDraftService } from './notification-draft.service';
import { NotificationDraftController } from './notification-draft.controller';
import { NotificationOperationsController } from './notification-operations.controller';

/**
 * Veli Bildirim Modülü (OKUL-08 + #266).
 * KVKK altyapısını (eligibility + redaction) yeniden kullanır; kendi
 * entity'lerini, outbox deposunu ve devamsızlık olay servisini sağlar.
 * `ATTENDANCE_ABSENCE_NOTIFICATION_PORT` dışa verilir → attendance modülü
 * kilit akışında bu portu çağırır.
 *
 * Route sıralaması: `/notifications/drafts` literal'i, `/notifications/:id`
 * parametresinden ÖNCE kaydedilmelidir (drafts listesi `:id` ile eşleşmesin).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationLog,
      NotificationOutboxItem,
      NotificationDispatchReceipt,
    ]),
  ],
  controllers: [NotificationDraftController, NotificationOperationsController],
  providers: [
    ParentNotificationService,
    NotificationEligibilityService,
    NotificationOutboxRepository,
    NotificationDispatchRepository,
    NotificationDispatchService,
    NotificationSimulatorService,
    AbsenceNotificationService,
    TransactionalAbsenceNotificationAdapter,
    NotificationDraftService,
    {
      provide: ATTENDANCE_ABSENCE_NOTIFICATION_PORT,
      useExisting: TransactionalAbsenceNotificationAdapter,
    },
  ],
  exports: [ParentNotificationService, ATTENDANCE_ABSENCE_NOTIFICATION_PORT],
})
export class NotificationsModule {}

