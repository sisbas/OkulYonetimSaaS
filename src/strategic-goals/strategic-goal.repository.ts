import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import { StrategicGoal } from './strategic-goal.entity';

export type CreateStrategicGoalValues = Pick<
  StrategicGoal,
  'academicYear' | 'metricKey' | 'metricLabel' | 'targetValue' | 'progressValue' | 'createdByUserId'
>;

export type UpdateStrategicGoalValues = Partial<
  Pick<StrategicGoal, 'targetValue' | 'progressValue' | 'metricLabel'>
>;

// TypeORM'de IsNull koşulu `IS NULL` olarak çevrilir: aktif (yumuşak
// silinmemiş) kayıt koşulu bu ifadeyle kurulur.
const ACTIVE = { deletedAt: IsNull() } as const;

@Injectable()
export class StrategicGoalRepository {
  constructor(
    @InjectRepository(StrategicGoal) private readonly repository: Repository<StrategicGoal>,
  ) {}

  async create(ctx: RequestContext, values: CreateStrategicGoalValues): Promise<StrategicGoal> {
    assertTenantScope(ctx, 'strategic_goals');
    // Tenant çağıranın bağlamından türetilir; istemci/payload tenant seçemez.
    return this.repository.save(
      this.repository.create({ ...values, tenantId: ctx.tenantId! }),
    );
  }

  async list(ctx: RequestContext, academicYear?: string): Promise<StrategicGoal[]> {
    assertTenantScope(ctx, 'strategic_goals');
    const qb = this.repository
      .createQueryBuilder('goal')
      .where('goal.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('goal.deleted_at IS NULL');

    if (academicYear) qb.andWhere('goal.academic_year = :academicYear', { academicYear });

    return qb
      .orderBy('goal.academic_year', 'DESC')
      .addOrderBy('goal.metric_key', 'ASC')
      .getMany();
  }

  async findActive(ctx: RequestContext, id: string): Promise<StrategicGoal | null> {
    assertTenantScope(ctx, 'strategic_goals');
    return this.repository.findOne({ where: { id, tenantId: ctx.tenantId, ...ACTIVE } });
  }

  async findActiveByYearAndMetric(
    ctx: RequestContext,
    academicYear: string,
    metricKey: string,
  ): Promise<StrategicGoal | null> {
    assertTenantScope(ctx, 'strategic_goals');
    return this.repository.findOne({
      where: { tenantId: ctx.tenantId, academicYear, metricKey, ...ACTIVE },
    });
  }

  async update(ctx: RequestContext, id: string, values: UpdateStrategicGoalValues): Promise<void> {
    assertTenantScope(ctx, 'strategic_goals');
    // Tenant sınırı where'de taşınır: başka kiracının hedefi güncellenemez.
    await this.repository.update({ id, tenantId: ctx.tenantId, ...ACTIVE }, values);
  }

  /** Aktif kayıt silindiyse true; kayıt yoksa/başka tenant'sa false. */
  async softDelete(ctx: RequestContext, id: string): Promise<boolean> {
    assertTenantScope(ctx, 'strategic_goals');
    const result = await this.repository.update(
      { id, tenantId: ctx.tenantId, ...ACTIVE },
      { deletedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }
}
