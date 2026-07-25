import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum TeacherBranchStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity({ name: 'teacher_branches' })
@Index('idx_teacher_branches_teacher_status', ['tenantId', 'teacherId', 'status', 'effectiveFrom', 'effectiveTo'])
export class TeacherBranch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ type: 'varchar', length: 16, default: TeacherBranchStatus.ACTIVE })
  status!: TeacherBranchStatus;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
