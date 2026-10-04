import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type StudentParentContactStatus = 'active' | 'inactive' | 'revoked';

/**
 * #266 N1a — Same-tenant student ↔ parent contact association.
 *
 * Effective-date/lifecycle/version sözleşmesi:
 * - `effectiveFrom`/`effectiveTo` ile zaman aralığı modellenir;
 *   `effective_to` NULL = açık aralık.
 * - `status` revoked/inactive olan veya effective-date dışına
 *   düşen ilişki uygun recipient sayılmaz.
 * - Başka tenant'a association yapılamaz: composite FK
 *   (tenant_id, parent_contact_id) -> parent_contacts(tenant_id, id)
 *   ve tüm sorgularda tenant predicate zorunludur.
 * - Bir öğrenci için birden fazla yetkili recipient açıkça
 *   modellenir; "ilk parent/contact" sessiz seçim YOKTUR.
 */
@Entity({ name: 'student_parent_contacts' })
@Index('uq_student_parent_contacts_tenant_id', ['tenantId', 'id'], {
  unique: true,
})
@Index('uq_student_parent_contacts_link', [
  'tenantId',
  'studentId',
  'parentContactId',
  'branchId',
], { unique: true })
@Index('idx_student_parent_contacts_tenant_id', ['tenantId'])
@Index('idx_student_parent_contacts_student', ['tenantId', 'studentId'])
@Index('idx_student_parent_contacts_branch', ['tenantId', 'branchId'])
@Index('idx_student_parent_contacts_effective', [
  'tenantId',
  'studentId',
  'effectiveFrom',
  'effectiveTo',
])
export class StudentParentContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'parent_contact_id', type: 'uuid' })
  parentContactId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'effective_from', type: 'timestamptz', default: () => 'now()' })
  effectiveFrom!: Date;

  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true })
  effectiveTo!: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'active' })
  status!: StudentParentContactStatus;

  /** Optimistic concurrency version — monotonik ilerler. */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
