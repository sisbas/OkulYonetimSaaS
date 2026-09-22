import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from './attendance.entity';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceSessionController } from './attendance.controller';
import { TeacherOwnLessonGuard } from './teacher-own-lesson.guard';
import { AttendanceAccessService } from './attendance-access.service';
import {
  ATTENDANCE_AUDIT_PORT,
  TransactionalAttendanceAuditAdapter,
} from './attendance-audit.adapter';
import { AuditLogRepository } from '../common/audit/audit-log.repository';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TypeOrmTransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import { ScheduleEvent } from '../schedules/schedule-event.entity';
import { ScheduleVersion } from '../schedules/schedule-version.entity';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceRecord,
      AttendanceSession,
      ScheduleEvent,
      ScheduleVersion,
    ]),
    TeachersModule,
  ],
  controllers: [AttendanceSessionController],
  providers: [
    AuditLogRepository,
    TypeOrmTransactionalAuditWriter,
    { provide: TRANSACTIONAL_AUDIT_WRITER, useExisting: TypeOrmTransactionalAuditWriter },
    TransactionalAttendanceAuditAdapter,
    { provide: ATTENDANCE_AUDIT_PORT, useExisting: TransactionalAttendanceAuditAdapter },
    AttendanceService,
    AttendanceSessionService,
    AttendanceAccessService,
    TeacherOwnLessonGuard,
  ],
  exports: [AttendanceService, AttendanceSessionService, AttendanceAccessService],
})
export class AttendanceModule {}
