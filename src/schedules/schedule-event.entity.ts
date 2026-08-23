import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Bir schedule versiyonuna ait ders programı olayı (satır).
 * tenant-scoped; referanslar (teacher/student_group/course/room/time_slot)
 * aynı kiracı/branch'te olmalı (migration FK guard'ları).
 * time_slot_snapshot: zaman dilimi anlık görüntüsü (immutable referans).
 * Şema: migration 1784700000000-CreateScheduleMinimumPublish.
 */
@Entity({ name: 'schedule_events' })
@Index('idx_schedule_events_read_port', [
  'tenantId',
  'branchId',
  'teacherId',
  'dayOfWeek',
  'startTime',
])
export class ScheduleEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ name: 'schedule_id', type: 'uuid' })
  scheduleId!: string;

  @Column({ name: 'version_id', type: 'uuid' })
  versionId!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'teacher_branch_id', type: 'uuid' })
  teacherBranchId!: string;

  @Column({ name: 'student_group_id', type: 'uuid' })
  studentGroupId!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'time_slot_id', type: 'uuid' })
  timeSlotId!: string;

  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'time_slot_snapshot', type: 'jsonb' })
  timeSlotSnapshot!: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
