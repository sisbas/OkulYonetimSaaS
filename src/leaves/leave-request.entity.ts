import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum LeaveDurationType {
  HOURLY = 'hourly',
  FULL_DAY = 'full_day',
  MULTI_DAY = 'multi_day',
}

export enum LeaveReasonCode {
  ANNUAL_LEAVE = 'annual_leave',
  ADMINISTRATIVE = 'administrative',
  HEALTH = 'health',
  OTHER = 'other',
}

export enum LeaveDecisionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum LeaveCoverageStatus {
  NOT_REQUIRED = 'not_required',
  UNRESOLVED = 'unresolved',
  PARTIALLY_COVERED = 'partially_covered',
  COVERED = 'covered',
}

@Entity({ name: 'leave_requests' })
@Index('idx_leave_requests_tenant_branch_status_start', ['tenantId', 'branchId', 'decisionStatus', 'startsAt'])
@Index('idx_leave_requests_tenant_teacher_status', ['tenantId', 'teacherId', 'decisionStatus'])
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'requester_user_id', type: 'uuid' })
  requesterUserId!: string;

  @Column({ name: 'duration_type', type: 'varchar', length: 16 })
  durationType!: LeaveDurationType;

  @Column({ name: 'reason_code', type: 'varchar', length: 32 })
  reasonCode!: LeaveReasonCode;

  @Column({ name: 'decision_status', type: 'varchar', length: 16, default: LeaveDecisionStatus.PENDING })
  decisionStatus!: LeaveDecisionStatus;

  @Column({ name: 'coverage_status', type: 'varchar', length: 32, default: LeaveCoverageStatus.NOT_REQUIRED })
  coverageStatus!: LeaveCoverageStatus;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId!: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
