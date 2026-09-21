import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from './attendance.entity';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceSessionController } from './attendance.controller';
import { TeacherOwnLessonGuard } from './teacher-own-lesson.guard';
import { AttendanceAccessService } from './attendance-access.service';
import { ScheduleEvent } from '../schedules/schedule-event.entity';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceRecord,
      AttendanceSession,
      ScheduleEvent,
    ]),
    TeachersModule,
  ],
  controllers: [AttendanceSessionController],
  providers: [
    AttendanceService,
    AttendanceSessionService,
    AttendanceAccessService,
    TeacherOwnLessonGuard,
  ],
  exports: [AttendanceService, AttendanceSessionService, AttendanceAccessService],
})
export class AttendanceModule {}
