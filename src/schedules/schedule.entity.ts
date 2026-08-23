import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ScheduleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  UNPUBLISHED = 'unpublished',
}

/**
 * Tenant/branch bazlı ders programı (P1B-05 / M3 Schedule Core).
 *
 * Bir schedule birden çok schedule_version (draft/published) taşır;
 * active_version_id yayında olan immutable versiyona işaret eder.
 * Şema: migration 1784700000000-CreateScheduleMinimumPublish.
 * tenant-scoped; tenant + branch aynı kiracıda olmalı (FK guard).
 */
@Entity({ name: 'schedules' })
@Index('idx_schedules_tenant_branch', ['tenantId', 'branchId'])
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: ScheduleStatus.DRAFT,
  })
  status!: ScheduleStatus;

  @Column({ name: 'revision', type: 'integer', default: 1 })
  revision!: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: Date;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: Date | null;

  @Column({ name: 'active_version_id', type: 'uuid', nullable: true })
  activeVersionId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
