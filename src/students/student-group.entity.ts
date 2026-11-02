import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StudentGroupStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * #461 F1: salt-okunur sınıf/şube grubu.
 *
 * Grup CRUD'u bu dilimin dışındadır; yalnız roster sorgusu ve günlük ders
 * etiketleri için okunur. `student_groups` şeması 1784690000000 migration'ına
 * aittir.
 */
@Entity({ name: 'student_groups' })
@Index('idx_student_groups_tenant_branch_status', [
  'tenantId',
  'branchId',
  'status',
])
export class StudentGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  code!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: StudentGroupStatus.ACTIVE,
  })
  status!: StudentGroupStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
