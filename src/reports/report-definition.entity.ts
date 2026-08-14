import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Rapor tanımı (OKUL-09 Reporting Module).
 *
 * Bir rapor tanımı, tenant-scoped bir "şablon"dur: hangi türde rapor
 * üretileceğini (devamsızlık özeti, öğrenci/öğretmen özeti vb.) ve
 * raporun sorgu spec'ini (querySpec jsonb) taşır.
 *
 * - tenant-scoped: her tanım tek bir tenant'a aittir.
 * - querySpec: esnek JSON yapı (filtreler, gruplama alanları, tarih aralığı).
 * - createdBy: raporu tanımlayan kullanıcının id'si (audit izi).
 */
@Entity({ name: 'report_definitions' })
@Index('idx_report_definitions_tenant', ['tenantId'])
export class ReportDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'name', type: 'varchar', length: 128 })
  name!: string;

  // Rapor türü: 'attendance_summary' | 'student_summary' | 'teacher_summary' ...
  @Column({ name: 'type', type: 'varchar', length: 48 })
  type!: string;

  // Esnek sorgu tanımı (filtreler, gruplama, tarih aralığı vb.).
  @Column({ name: 'query_spec', type: 'jsonb' })
  querySpec!: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
