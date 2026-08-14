import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * MEB e-okul'den senkronize edilen kayıt (öğrenci/öğretmen/score vb.).
 * externalId (MEB kayıt no) unique — idempotent upsert için anahtar.
 * KVKK: ham PII bu tabloya yazılMAZ; maskelenmiş halde tutulur.
 */
@Entity({ name: 'eokul_records' })
@Index('idx_eokul_records_tenant_external', ['tenantId', 'externalId'], { unique: true })
export class EokulRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'external_id', type: 'varchar', length: 64 })
  externalId!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 32 })
  entityType!: string;

  @Column({ name: 'masked_payload', type: 'jsonb' })
  maskedPayload!: Record<string, unknown>;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'now()' })
  syncedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
