import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ScheduleVersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  UNPUBLISHED = 'unpublished',
}

export enum ScheduleValidationMode {
  FULL = 'FULL',
  INCREMENTAL = 'INCREMENTAL',
}

/**
 * Bir schedule'a ait versiyon (draft / published). Yayınlanan versiyon
 * immutable kabul edilir; schedule.publisher bunu zorular.
 * snapshot jsonb: ScheduleEventDraft[] (published anlık görüntü).
 * Şema: migration 1784700000000-CreateScheduleMinimumPublish.
 */
@Entity({ name: 'schedule_versions' })
@Index('idx_schedule_versions_schedule', ['scheduleId'])
@Index('uq_schedule_versions_published', ['tenantId', 'branchId', 'scheduleId'], {
  where: "status = 'published'",
  unique: true,
})
export class ScheduleVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'schedule_id', type: 'uuid' })
  scheduleId!: string;

  @Column({ name: 'version_no', type: 'integer' })
  versionNo!: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: ScheduleVersionStatus.DRAFT,
  })
  status!: ScheduleVersionStatus;

  @Column({
    name: 'validation_mode',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  validationMode!: ScheduleValidationMode | null;

  @Column({ name: 'validation_fingerprint', type: 'varchar', length: 128, nullable: true })
  validationFingerprint!: string | null;

  @Column({ name: 'validated_revision', type: 'integer', nullable: true })
  validatedRevision!: number | null;

  @Column({ name: 'snapshot', type: 'jsonb' })
  snapshot!: unknown;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'unpublished_at', type: 'timestamptz', nullable: true })
  unpublishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
