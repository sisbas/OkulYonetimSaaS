import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './schedule.entity';
import { ScheduleVersion } from './schedule-version.entity';
import { ScheduleEvent } from './schedule-event.entity';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { SolverPort } from './solver/solver-port';
import { DeterministicSolver } from './solver/deterministic-solver';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, ScheduleVersion, ScheduleEvent]),
  ],
  providers: [
    ScheduleService,
    { provide: SolverPort, useClass: DeterministicSolver },
  ],
  controllers: [ScheduleController],
  exports: [ScheduleService, SolverPort],
})
export class ScheduleModule {}
