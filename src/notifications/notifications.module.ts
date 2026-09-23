import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from './notification-log.entity';
import { NotificationOutboxItem } from './notification-outbox.entity';
import { ParentNotificationService } from './parent-notification.service';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { AbsenceNotificationService } from './absence-notification.service';
import { TransactionalAbsenceNotificationAdapter } from './absence-notification.adapter';
import { NotificationConsentController } from './notification-consent.controller';
import { NotificationEligibilityService } from '../kvkk/notification-eligibility.service';
import { ConsentLifecycleService } from '../kvkk/consent-lifecycle.service';
import { AuditLogRepository } from '../common/audit/audit-log.repository';
import { TypeOrmTransactionalAuditWriter } from '../common/audit/transactional-audit-writer';
import { TRANSACTIONAL_AUDIT_WRITER } from '../common/audit/transactional-audit-writer';
import { ATTENDANCE_ABSENCE_NOTIFICATION_PORT } from '../attendance/attendance-absence-notification.port';

/**
 * Veli Bildirim Modülü (OKUL-08 + #266).
 * KVKK altyapısını (eligibility + redaction + consent yaşam döngüsü) yeniden
 * kullanır; kendi entity'lerini, outbox deposunu, consent yüzeyini ve devamsızlık
 * olay servisini sağlar. Kendi transactional audit writer'ını sağlar (diğer
 * domain modülleriyle aynı desen), böylece konsent mutasyonu + audit aynı
 * transaction'da kalır.
 * `ATTENDANCE_ABSENCE_NOTIFICATION_PORT` dışa verilir → attendance modülü
 * kilit akışında bu portu çağırır.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog, NotificationOutboxItem])],
  controllers: [NotificationConsentController],
  providers: [
    ParentNotificationService,
    NotificationEligibilityService,
    ConsentLifecycleService,
    NotificationOutboxRepository,
    AbsenceNotificationService,
    TransactionalAbsenceNotificationAdapter,
    // Audit zinciri yazıcısı için `AuditLogRepository` AYNI modülde kayıtlı
    // olmalıdır: writer onu constructor'da ister ve entity manager çağrıdan
    // gelir. Diğer domain modülleri de (attendance/leaves) bu deseni kullanır;
    // eksik bırakılırsa DI çözümlemesi BOOT'ta başarısız olur (unit testler
    // bunu yakalamaz).
    AuditLogRepository,
    TypeOrmTransactionalAuditWriter,
    { provide: TRANSACTIONAL_AUDIT_WRITER, useExisting: TypeOrmTransactionalAuditWriter },
    {
      provide: ATTENDANCE_ABSENCE_NOTIFICATION_PORT,
      useExisting: TransactionalAbsenceNotificationAdapter,
    },
  ],
  exports: [ParentNotificationService, ATTENDANCE_ABSENCE_NOTIFICATION_PORT],
})
export class NotificationsModule {}

