import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './schedule.entity';
import { ScheduleVersion } from './schedule-version.entity';
import { ScheduleEvent } from './schedule-event.entity';
import { ScheduleService } from './schedule.service';
import { ScheduleReadService } from './schedule-read.service';
import { ScheduleController } from './schedule.controller';
import { TeachersModule } from '../teachers/teachers.module';
import { SolverPort } from './solver/solver-port';
import { DeterministicSolver } from './solver/deterministic-solver';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, ScheduleVersion, ScheduleEvent]),
    TeachersModule,
  ],
  providers: [
    ScheduleService,
    ScheduleReadService,
    { provide: SolverPort, useClass: DeterministicSolver },
  ],
  controllers: [ScheduleController],
  exports: [ScheduleService, ScheduleReadService, SolverPort],
})
export class ScheduleModule {}
