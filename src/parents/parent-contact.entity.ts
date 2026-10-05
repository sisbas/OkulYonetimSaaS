import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ParentContactStatus = 'active' | 'inactive' | 'revoked';

/**
 * #266 N1a — Tenant-bound authorized recipient / guardian reference.
 *
 * KVKK data minimization: bu tablo serbest metin veya gereksiz
 * kişisel alan taşımaz; yalnız guardian kimlik referansı
 * (nullable), lifecycle durum ve optimistic version vardır.
 * İsim/telefon varlığından guardian veya consent authority
 * çıkarılmaz.
 */
@Entity({ name: 'parent_contacts' })
@Index('uq_parent_contacts_tenant_id', ['tenantId', 'id'], { unique: true })
@Index('idx_parent_contacts_tenant_id', ['tenantId'])
@Index('idx_parent_contacts_guardian_ref', ['tenantId', 'guardianRefId'])
export class ParentContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Guardian kimlik referansı (users.id); nullable, authoritative
   *  doğrulaması ayrı boundary'de yapılır. */
  @Column({ name: 'guardian_ref_id', type: 'uuid', nullable: true })
  guardianRefId!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'active' })
  status!: ParentContactStatus;

  /** Optimistic concurrency version — monotonik ilerler. */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
