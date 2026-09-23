import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type NotificationOutboxStatus =
  | 'pending'
  | 'blocked_consent'
  | 'dispatched'
  | 'failed';

/**
 * Transactional outbox satırı (#266).
 *
 * Kilitlenen yoklama oturumundan türeyen devamsızlık bildirimi niyeti. Satır,
 * domain mutasyonuyla aynı transaction'da yazılır; gönderim ayrı relay'in işidir.
 * `payload_masked` PII taşımaz; `dedupe_key` idempotency sağlar.
 */
@Entity({ name: 'notification_outbox' })
@Index('uq_notification_outbox_tenant_dedupe', ['tenantId', 'dedupeKey'], { unique: true })
@Index('idx_notification_outbox_pending', ['status', 'availableAt'])
export class NotificationOutboxItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 160 })
  dedupeKey!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'channel', type: 'varchar', length: 32 })
  channel!: string;

  @Column({ name: 'status', type: 'varchar', length: 24, default: 'pending' })
  status!: NotificationOutboxStatus;

  @Column({ name: 'payload_masked', type: 'jsonb', default: () => `'{}'::jsonb` })
  payloadMasked!: Record<string, unknown>;

  @Column({ name: 'reason', type: 'varchar', length: 64, nullable: true })
  reason!: string | null;

  @Column({ name: 'consent_version', type: 'integer', nullable: true })
  consentVersion!: number | null;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
  availableAt!: Date;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
