import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from './notification-log.entity';
import { NotificationOutboxItem } from './notification-outbox.entity';
import { ParentNotificationService } from './parent-notification.service';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { AbsenceNotificationService } from './absence-notification.service';
import { TransactionalAbsenceNotificationAdapter } from './absence-notification.adapter';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { ATTENDANCE_ABSENCE_NOTIFICATION_PORT } from '../attendance/attendance-absence-notification.port';

/**
 * Veli Bildirim Modülü (OKUL-08 + #266).
 * KVKK altyapısını (eligibility + redaction) yeniden kullanır; kendi
 * entity'lerini, outbox deposunu ve devamsızlık olay servisini sağlar.
 * `ATTENDANCE_ABSENCE_NOTIFICATION_PORT` dışa verilir → attendance modülü
 * kilit akışında bu portu çağırır.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog, NotificationOutboxItem])],
  providers: [
    ParentNotificationService,
    NotificationEligibilityService,
    NotificationOutboxRepository,
    AbsenceNotificationService,
    TransactionalAbsenceNotificationAdapter,
    {
      provide: ATTENDANCE_ABSENCE_NOTIFICATION_PORT,
      useExisting: TransactionalAbsenceNotificationAdapter,
    },
  ],
  exports: [ParentNotificationService, ATTENDANCE_ABSENCE_NOTIFICATION_PORT],
})
export class NotificationsModule {}

