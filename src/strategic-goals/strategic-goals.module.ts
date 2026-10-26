import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StrategicGoalController } from './strategic-goal.controller';
import { StrategicGoal } from './strategic-goal.entity';
import { StrategicGoalRepository } from './strategic-goal.repository';
import { StrategicGoalService } from './strategic-goal.service';

/**
 * #457 — Stratejik hedefler modülü. Hedefler school-scoped (tenant) olduğu
 * için kiracı sınırı repo + TenantScopeGuard çift hattıyla kurulur.
 */
@Module({
  imports: [TypeOrmModule.forFeature([StrategicGoal])],
  controllers: [StrategicGoalController],
  providers: [StrategicGoalRepository, StrategicGoalService],
  exports: [StrategicGoalService],
})
export class StrategicGoalsModule {}
