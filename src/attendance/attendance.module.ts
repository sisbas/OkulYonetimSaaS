import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from './attendance.entity';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceSessionController } from './attendance.controller';
import { TeacherOwnLessonGuard } from './teacher-own-lesson.guard';
import { ScheduleEvent } from '../schedules/schedule-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceRecord,
      AttendanceSession,
      ScheduleEvent,
    ]),
  ],
  controllers: [AttendanceSessionController],
  providers: [
    AttendanceService,
    AttendanceSessionService,
    TeacherOwnLessonGuard,
  ],
  exports: [AttendanceService, AttendanceSessionService],
})
export class AttendanceModule {}
