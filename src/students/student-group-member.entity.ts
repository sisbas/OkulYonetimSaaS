import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StudentGroupMembershipStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * #461 F1: öğrenci–grup üyeliği.
 *
 * Üyelik, öğrenci ve grubun aynı tenant/branch'te olmasını composite FK ile
 * zorunlu kılar. Soft-delete edilen üyelik roster'a girmez; aynı öğrenci aynı
 * grupta yalnız bir aktif üyelik taşıyabilir (partial unique index).
 */
@Entity({ name: 'student_group_members' })
@Index('idx_student_group_members_tenant_group_status', [
  'tenantId',
  'branchId',
  'studentGroupId',
  'status',
])
@Index('idx_student_group_members_tenant_student', ['tenantId', 'studentId'])
export class StudentGroupMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'student_group_id', type: 'uuid' })
  studentGroupId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: StudentGroupMembershipStatus.ACTIVE,
  })
  status!: StudentGroupMembershipStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
