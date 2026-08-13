import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Mevcut `roles` tablosunu eşleyen tenant-bazlı rol entity'si (OKUL-01).
 *
 * Tenant izolasyonu: `tenantId` sütunu `@Index` ile korunur; tüm erişimler
 * aktörün tenant kimliğiyle sınırlı tutulmalıdır (bkz. RbacService).
 * Bu entity salt-okunur (read-only) yönetim amaçlıdır; seed/migration
 * katmanı dokunulmamıştır.
 */
@Entity({ name: 'roles' })
@Index(['tenantId', 'name'], { unique: true })
export class RbacRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  @Index()
  tenantId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_system_role', default: false })
  isSystemRole: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
