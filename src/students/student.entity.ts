import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StudentEnrollmentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  GRADUATED = 'graduated',
  TRANSFERRED = 'transferred',
}

/**
 * #461 F1: salt-okunur öğrenci temel kaydı.
 *
 * Bu entity yalnız roster/yoklama için gereken alanları taşır; veli/guardian
 * iletişimi ayrı KVKK domain'indedir (`parent_contacts`). API yanıtına
 * `birth_date`, `gender` veya veli bilgisi çıkarılmaz.
 */
@Entity({ name: 'students' })
@Index('idx_students_tenant_branch_status', [
  'tenantId',
  'branchId',
  'enrollmentStatus',
])
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'student_code', type: 'varchar', length: 40, nullable: true })
  studentCode!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 80 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 80 })
  lastName!: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gender!: string | null;

  @Column({
    name: 'enrollment_status',
    type: 'varchar',
    length: 16,
    default: StudentEnrollmentStatus.ACTIVE,
  })
  enrollmentStatus!: StudentEnrollmentStatus;

  @Column({ name: 'enrollment_date', type: 'date', nullable: true })
  enrollmentDate!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
