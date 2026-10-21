import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import {
  CreateStrategicGoalDto,
} from './dto/create-strategic-goal.dto';
import { ListStrategicGoalsQueryDto } from './dto/list-strategic-goals-query.dto';
import { UpdateStrategicGoalDto } from './dto/update-strategic-goal.dto';
import { StrategicGoalRepository } from './strategic-goal.repository';
import { StrategicGoal } from './strategic-goal.entity';

export type StrategicGoalResponse = Readonly<{
  id: string;
  academicYear: string;
  metricKey: string;
  metricLabel: string | null;
  targetValue: number;
  progressValue: number | null;
  createdAt: Date;
  updatedAt: Date;
}>;

/** Duplicate hedef reddi — istemcinin okunabilir nedeni (#441 karar 31). */
export class DuplicateStrategicGoalException extends ConflictException {
  constructor(academicYear: string, metricKey: string) {
    super({
      reason: 'duplicate_metric_year',
      message: `A target for metric "${metricKey}" already exists for academic year ${academicYear}; only one target per metric per year is allowed.`,
    });
  }
}

const UNIQUE_VIOLATION = '23505';
const UNIQUE_INDEX_NAME = 'uq_strategic_goals_tenant_year_metric';
const METRIC_KEY_MAX = 120;

@Injectable()
export class StrategicGoalService {
  constructor(private readonly goals: StrategicGoalRepository) {}

  async create(ctx: RequestContext, dto: CreateStrategicGoalDto): Promise<StrategicGoalResponse> {
    const metricKey = this.normalizeMetricKey(dto.metricKey);
    await this.assertNoActiveDuplicate(ctx, dto.academicYear, metricKey);

    try {
      const saved = await this.goals.create(ctx, {
        tenantId: ctx.tenantId!,
        academicYear: dto.academicYear,
        metricKey,
        metricLabel: dto.metricLabel ?? null,
        targetValue: dto.targetValue,
        // Gerçekleşme elle girilir; oluşturmada boş başlar.
        progressValue: null,
        createdByUserId: ctx.user?.userId ?? ctx.userId ?? null,
      });
      return this.toResponse(saved);
    } catch (error) {
      // Yarış durumu: servis kontrolü ile DB partial-unique indeksi arasında
      // ikinci bir hedef sızarsa indeks reddeder; aynı okunabilir nedene map'lenir.
      if (this.isTenantYearMetricUniqueViolation(error)) {
        throw new DuplicateStrategicGoalException(dto.academicYear, metricKey);
      }
      throw error;
    }
  }

  async list(ctx: RequestContext, query: ListStrategicGoalsQueryDto): Promise<StrategicGoalResponse[]> {
    const rows = await this.goals.list(ctx, query.academicYear);
    return rows.map((goal) => this.toResponse(goal));
  }

  async get(ctx: RequestContext, id: string): Promise<StrategicGoalResponse> {
    const goal = await this.goals.findActive(ctx, id);
    if (!goal) throw new NotFoundException('Strategic goal not found');
    return this.toResponse(goal);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateStrategicGoalDto): Promise<StrategicGoalResponse> {
    if (dto.targetValue === undefined && dto.progressValue === undefined && dto.metricLabel === undefined) {
      throw new BadRequestException('No fields to update');
    }
    await this.goals.update(ctx, id, {
      targetValue: dto.targetValue,
      progressValue: dto.progressValue,
      metricLabel: dto.metricLabel,
    });
    return this.get(ctx, id);
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.goals.softDelete(ctx, id);
  }

  private async assertNoActiveDuplicate(
    ctx: RequestContext,
    academicYear: string,
    metricKey: string,
  ): Promise<void> {
    const existing = await this.goals.findActiveByYearAndMetric(ctx, academicYear, metricKey);
    if (existing) throw new DuplicateStrategicGoalException(academicYear, metricKey);
  }

  private normalizeMetricKey(metricKey: string): string {
    const normalized = metricKey.trim();
    if (!normalized || normalized.length > METRIC_KEY_MAX) {
      throw new BadRequestException('metricKey is required and must be at most 120 characters');
    }
    return normalized;
  }

  private isTenantYearMetricUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = (error as QueryFailedError).driverError as {
      code?: string;
      constraint?: string;
      detail?: string;
    } | null;
    if (driverError?.code !== UNIQUE_VIOLATION) return false;
    // Postgres unique ihlalinde indeks adı `constraint` alanında gelir
    // (partial unique index dâhil); `detail` yedek olarak taranır.
    return driverError.constraint === UNIQUE_INDEX_NAME || (driverError.detail ?? '').includes(UNIQUE_INDEX_NAME);
  }

  private toResponse(goal: StrategicGoal): StrategicGoalResponse {
    return {
      id: goal.id,
      academicYear: goal.academicYear,
      metricKey: goal.metricKey,
      metricLabel: goal.metricLabel,
      targetValue: goal.targetValue,
      progressValue: goal.progressValue,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }
}
