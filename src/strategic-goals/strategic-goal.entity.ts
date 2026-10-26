import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * #457 — Stratejik hedef. Hedef okula (tenant) aittir; akademik yıla
 * kapsulanır ve (tenant, yıl, metrik) başına tektir (#441 karar 29-30).
 * Metrik tipi okul tanımlıdır (`metric_key`); hedef ve gerçekleşme elle girilir.
 */
@Entity({ name: 'strategic_goals' })
@Index('idx_strategic_goals_tenant_year', ['tenantId', 'academicYear'])
export class StrategicGoal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'academic_year', type: 'varchar', length: 32 })
  academicYear!: string;

  @Column({ name: 'metric_key', type: 'varchar', length: 120 })
  metricKey!: string;

  @Column({ name: 'metric_label', type: 'varchar', length: 200, nullable: true })
  metricLabel!: string | null;

  @Column({
    name: 'target_value',
    type: 'numeric',
    precision: 14,
    scale: 4,
    transformer: {
      to: (value: number): string => String(value),
      from: (value: string): number => Number(value),
    },
  })
  targetValue!: number;

  @Column({
    name: 'progress_value',
    type: 'numeric',
    precision: 14,
    scale: 4,
    nullable: true,
    transformer: {
      to: (value: number | null): string | null => (value === null ? null : String(value)),
      from: (value: string | null): number | null => (value === null ? null : Number(value)),
    },
  })
  progressValue!: number | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
