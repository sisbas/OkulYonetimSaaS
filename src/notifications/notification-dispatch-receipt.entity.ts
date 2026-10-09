import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type DispatchOutcome = 'provider_accepted' | 'provider_rejected' | 'uncertain';

/**
 * Dayanıklı (durable) sağlayıcı receipt'i (#266 N2).
 *
 * Her gönderim denemesinin sonucunu kalıcı olarak kanıtlar:
 * - `UNIQUE (outbox_id, attempt)` — idempotency: aynı deneme için ikinci
 *   etki oluşmaz (yeniden deneme yeni attempt numarasıyla ilerler).
 * - `simulated` CHECK migration'da `= true` ile sabitlenmiştir: N3 kapsamında
 *   gerçek dış teslimat YOKTUR; "teslim edildi" iddia eden gerçek gönderim
 *   satırı veritabanına yazılamaz (fail-closed).
 * - `receipt` jsonb allowlist ile sınırlıdır: PII taşımaz, yalnız maskeleli
 *   meta veri (eventType, channel, templateRef, consent kararı, backoff).
 *
 * Geri alma (`down()`) bu tabloyu siler → delil kaybı; roll-forward tercih edilir.
 */
@Entity({ name: 'notification_dispatch_receipts' })
@Index('uq_notification_dispatch_receipt_attempt', ['outboxId', 'attempt'], {
  unique: true,
})
export class NotificationDispatchReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'outbox_id', type: 'uuid' })
  outboxId!: string;

  /** 1 tabanlı deneme sırası — `notification_outbox.attempts` ile eşleşir. */
  @Column({ type: 'integer' })
  attempt!: number;

  /** Denemenin yapıldığı fencing token'ı — stale işleyici ayrımı. */
  @Column({ name: 'fencing_token', type: 'integer' })
  fencingToken!: number;

  @Column({ type: 'varchar', length: 32 })
  outcome!: DispatchOutcome;

  /** N3 sözleşmesi: her zaman true (migration CHECK ile zorunlu). */
  @Column({ type: 'boolean', default: true })
  simulated!: boolean;

  @Column({ name: 'provider_ref', type: 'varchar', length: 120, nullable: true })
  providerRef!: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  /** Allowlist meta veri — PII taşımaz. */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  receipt!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
