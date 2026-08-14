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
 * tenant-scoped; (tenant_id, student_id, course_id, session_date) unique —
 * idempotent: aynı ders için tekrar işaretleme son kaydı günceller.
 * student_id, e-okul senkronizasyonundan gelen öğrenci referansıdır.
 */
@Entity({ name: 'attendance_records' })
@Index('idx_attendance_tenant_student', ['tenantId', 'studentId'])
@Index('idx_attendance_tenant_course_date', ['tenantId', 'courseId', 'sessionDate'])
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'session_date', type: 'date' })
  sessionDate!: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: AttendanceStatus.ABSENT })
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
