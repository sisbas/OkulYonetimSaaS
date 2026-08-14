import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ReportRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Rapor çalıştırma kaydı (OKUL-09 Reporting Module).
 *
 * generateReport çağrıldığında bir ReportRun oluşturulur; aggregate sonucu
 * (PII maskelenmiş haliyle) resultJson jsonb içinde saklanır.
 *
 * - tenant-scoped: definitionId üzerinden tanıma, tanım da tenant'a aittir.
 * - resultJson: KVKK kuralı gereği maskelenmiş (redactObject uygulanmış) halde tutulur.
 * - status: üretim yaşam döngüsü (pending → running → completed|failed).
 */
@Entity({ name: 'report_runs' })
@Index('idx_report_runs_tenant_definition', ['tenantId', 'definitionId'])
export class ReportRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'definition_id', type: 'uuid' })
  definitionId!: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: ReportRunStatus.PENDING })
  status!: ReportRunStatus;

  // Üretilen aggregate sonucu — KVKK maskeli halde saklanır.
  @Column({ name: 'result_json', type: 'jsonb', nullable: true })
  resultJson!: Record<string, unknown> | null;

  @Column({ name: 'generated_at', type: 'timestamptz', nullable: true })
  generatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
