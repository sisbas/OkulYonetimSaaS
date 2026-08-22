import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  EXCUSED = 'excused',
}

/**
 * Ders bazlı yoklama kaydı (OKUL-06).
 *
 * tenant-scoped; (tenant_id, session_id, student_id) unique —
 * idempotent: aynı oturum için tekrar işaretleme son kaydı günceller.
 * Canonical M5 authority chain: ScheduleEvent -> AttendanceSession ->
 * AttendanceRecord (session_id). Aligned with migration
 * 1820000000000-ReconcileAttendanceRecordsToSessionSchema.
 */
@Entity({ name: 'attendance_records' })
@Index('idx_attendance_tenant_student', ['tenantId', 'studentId'])
@Index('idx_attendance_tenant_session', ['tenantId', 'sessionId'])
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status!: AttendanceStatus;

  @Column({ name: 'marked_by_id', type: 'uuid', nullable: true })
  markedById!: string | null;

  // KVKK: öğrenciye dair serbest not; redaction-registry ile maskelenebilir.
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
