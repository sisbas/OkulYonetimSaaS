import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EokulSyncStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

export enum EokulEntityType {
  STUDENT = 'student',
  TEACHER = 'teacher',
  COURSE_ENROLLMENT = 'course_enrollment',
  SCORE = 'score',
}

/**
 * MEB e-okul senkronizasyon kaydı. Her sync run'ı tenant bazlı izlenir;
 * idempotent upsert için externalId (MEB kayıt no) kullanılır.
 */
@Entity({ name: 'eokul_sync_runs' })
@Index('idx_eokul_sync_tenant_status', ['tenantId', 'status'])
export class EokulSyncRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 32 })
  entityType!: EokulEntityType;

  @Column({ name: 'status', type: 'varchar', length: 16, default: EokulSyncStatus.PENDING })
  status!: EokulSyncStatus;

  @Column({ name: 'external_id', type: 'varchar', length: 64, nullable: true })
  externalId!: string | null;

  @Column({ name: 'records_total', type: 'int', default: 0 })
  recordsTotal!: number;

  @Column({ name: 'records_upserted', type: 'int', default: 0 })
  recordsUpserted!: number;

  @Column({ name: 'records_failed', type: 'int', default: 0 })
  recordsFailed!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
