import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationStatus, NotificationChannel } from '../kvkk/types';

/**
 * Veli Bildirim Günlüğü (OKUL-08) — Parent Notification Log.
 *
 * tenant-scoped bildirim denemesi / gönderim kaydıdır. Her veliye yapılan
 * bildirim (onaylı, reddedilen ya da engellenen) buraya yazılır.
 *
 * KVKK: message_body alanı her zaman MASKELENMİŞ (redactNotificationPayload
 * ile) halde saklanır; ham PII (telefon, eposta, serbest metin) asla diske
 * yazılmaz. Sütun adı `message_body_masked` ile bu davranışı belgelemektedir.
 *
 * (tenant_id, subject_id, notification_id) benzersiz index'i idempotent
 * kayıt sağlar — aynı bildirim için tekrar işleme son kaydı günceller.
 */
@Entity({ name: 'notification_logs' })
@Index('idx_notification_logs_tenant_subject', ['tenantId', 'subjectId'])
@Index('idx_notification_logs_tenant_notification', ['tenantId', 'notificationId'])
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Bildirimin hedefi olan veli/öğrenci subject kimliği. */
  @Column({ name: 'notification_id', type: 'varchar', length: 64 })
  notificationId!: string;

  @Column({ name: 'subject_id', type: 'varchar', length: 64 })
  subjectId!: string;

  @Column({ name: 'channel', type: 'varchar', length: 32 })
  channel!: NotificationChannel;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'draft' })
  status!: NotificationStatus;

  // KVKK: maskelenmiş mesaj gövdesi (ham PII taşımaz).
  @Column({ name: 'message_body_masked', type: 'text', nullable: true })
  messageBodyMasked!: string | null;

  // Engel nedeni (blocked_consent / blocked_phone / vb.) — audit için.
  @Column({ name: 'reason', type: 'varchar', length: 64, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;
}
