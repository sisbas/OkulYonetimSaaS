import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLog } from './notification-log.entity';
import { ParentNotificationService } from './parent-notification.service';

/**
 * Veli Bildirim Modülü (OKUL-08).
 * KVKK altyapısını (eligibility + redaction) yeniden kullanır; kendi
 * entity'sini ve servisini sağlar.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog])],
  providers: [ParentNotificationService],
  exports: [ParentNotificationService],
})
export class NotificationsModule {}
