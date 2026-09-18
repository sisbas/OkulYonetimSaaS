import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AttendanceSessionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  LOCKED = 'locked',
}

/**
 * Yayınlanmış ScheduleEvent occurrence'ından türetilen yoklama oturumu (OKUL-06, M5).
 *
 * Canonical authority chain: ScheduleEvent -> AttendanceSession -> AttendanceRecord.
 * Session yalnızca PUBLISHED bir ScheduleEvent occurrence'ından oluşturulur;
 * rosterSnapshot (studentId[]) oluşturulma anında immutable snapshot'tır —
 * sonraki grup değişiklikleri oturumu etkilemez.
 *
 * Optimistic concurrency: `version` alanı ile kontrollü düzeltme/lock sağlanır.
 * tenant-scoped; (tenant_id, schedule_event_id, session_date) unique.
 */
@Entity({ name: 'attendance_sessions' })
@Index('idx_attendance_sessions_tenant_schedule_date', [
  'tenantId',
  'scheduleEventId',
  'sessionDate',
])
@Index('idx_attendance_sessions_tenant_teacher', ['tenantId', 'teacherId'])
export class AttendanceSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'schedule_event_id', type: 'uuid' })
  scheduleEventId!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'student_group_id', type: 'uuid', nullable: true })
  studentGroupId!: string | null;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'room_id', type: 'uuid', nullable: true })
  roomId!: string | null;

  @Column({ name: 'session_date', type: 'date' })
  sessionDate!: Date;

  /**
   * Immutable roster snapshot: oturum oluşturulurken çekilen öğrenci ID listesi.
   * StudentGroup entity bağımlılığı M2'ye bırakılır; burada explicit snapshot.
   */
  @Column({ name: 'roster_snapshot', type: 'jsonb' })
  rosterSnapshot!: string[];

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: AttendanceSessionStatus.PUBLISHED,
  })
  status!: AttendanceSessionStatus;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'locked_by_id', type: 'uuid', nullable: true })
  lockedById!: string | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
