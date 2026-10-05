import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ParentContactStatus } from './parent-contact.entity';

export type ContactChannel = 'sms' | 'whatsapp' | 'email';

export type ContactVerificationStatus =
  | 'unverified'
  | 'verified'
  | 'expired'
  | 'revoked';

export type ContactPointStatus = ParentContactStatus;

/**
 * #266 N1a — Same-tenant contact point for a parent contact.
 *
 * KVKK: `encryptedValue`, AES-256-GCM authenticated-encryption
 * envelope'ının JSON seri halidir (`{ v, keyId, nonce, ciphertext,
 * tag }`); ham contact değeri (telefon/eposta) hiçbir zaman bu
 * sütunda plaintext olarak yazılmaz. `maskedDisplay`, ham değeri
 * taşımayan maskelenmiş projeksiyondur. `blindIndex`, purpose-
 * bound keyed HMAC'tir (plain SHA DEĞİLDİR).
 *
 * `verified` client flag'i authoritative verification DEĞİLDİR;
 * yalnız `verificationStatus` + `verificationEvidenceRef`
 * (trusted provider/evidence kaynağı) geçerlidir.
 */
@Entity({ name: 'contact_points' })
@Index('uq_contact_points_tenant_id', ['tenantId', 'id'], { unique: true })
@Index('idx_contact_points_tenant_id', ['tenantId'])
@Index('idx_contact_points_parent', ['tenantId', 'parentContactId'])
@Index('idx_contact_points_blind', ['tenantId', 'blindIndex'])
export class ContactPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Same-tenant parent contact referansı (composite FK). */
  @Column({ name: 'parent_contact_id', type: 'uuid' })
  parentContactId!: string;

  @Column({ name: 'channel', type: 'varchar', length: 30 })
  channel!: ContactChannel;

  /** AES-256-GCM envelope (JSON). Ham değer ASLA plaintext değildir. */
  @Column({ name: 'encrypted_value', type: 'text' })
  encryptedValue!: string;

  /** Maskelenmiş projeksiyon (ham değer taşımaz). */
  @Column({ name: 'masked_display', type: 'varchar', length: 64 })
  maskedDisplay!: string;

  /** Purpose-bound keyed blind index (dedupe/lookup; nullable). */
  @Column({ name: 'blind_index', type: 'varchar', length: 64, nullable: true })
  blindIndex!: string | null;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 30,
    default: 'unverified',
  })
  verificationStatus!: ContactVerificationStatus;

  /** Trusted verification/evidence referansı (provider/evidence kaynağı). */
  @Column({ name: 'verification_evidence_ref', type: 'text', nullable: true })
  verificationEvidenceRef!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'active' })
  status!: ContactPointStatus;

  /** Optimistic concurrency version — monotonik ilerler. */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
