import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum CourseStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity({ name: 'courses' })
@Index('idx_courses_tenant_status', ['tenantId', 'status'])
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  code!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 16, default: CourseStatus.ACTIVE })
  status!: CourseStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt!: Date | null;
}
