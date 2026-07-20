import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import { TimeSlot, TimeSlotStatus } from './time-slot.entity';

export type TimeSlotListQuery = {
  branchId: string;
  dayOfWeek?: string | number;
  page?: string | number;
  limit?: string | number;
};

export type TimeSlotCreateValues = Pick<TimeSlot, 'branchId' | 'name' | 'dayOfWeek' | 'startTime' | 'endTime' | 'orderIndex'>;

export type TimeSlotMutationScope = {
  branchId: string;
  dayOfWeek: number;
};

export type PaginatedTimeSlots = {
  data: TimeSlot[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

function positiveInt(value: string | number | undefined, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function mutationScopeKey(ctx: RequestContext, scope: TimeSlotMutationScope): string {
  return ['time_slots', ctx.tenantId, scope.branchId, scope.dayOfWeek].join(':');
}

@Injectable()
export class TimeSlotRepository {
  constructor(@InjectRepository(TimeSlot) private readonly repository: Repository<TimeSlot>) {}

  withManager(manager: EntityManager): TimeSlotRepository {
    return new TimeSlotRepository(manager.getRepository(TimeSlot));
  }

  async lockMutationScopes(ctx: RequestContext, scopes: TimeSlotMutationScope[]): Promise<void> {
    assertTenantScope(ctx, 'time_slots');
    const lockKeys = [...new Set(scopes.map((scope) => mutationScopeKey(ctx, scope)))].sort();

    for (const lockKey of lockKeys) {
      await this.repository.manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [lockKey],
      );
    }
  }

  async list(ctx: RequestContext, query: TimeSlotListQuery): Promise<PaginatedTimeSlots> {
    assertTenantScope(ctx, 'time_slots');
    const page = positiveInt(query.page, 1, 10_000);
    const limit = positiveInt(query.limit, 20, 100);
    const qb = this.repository
      .createQueryBuilder('slot')
      .where('slot.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('slot.branch_id = :branchId', { branchId: query.branchId })
      .andWhere('slot.status = :status', { status: TimeSlotStatus.ACTIVE });

    if (query.dayOfWeek !== undefined) {
      qb.andWhere('slot.day_of_week = :dayOfWeek', { dayOfWeek: Number(query.dayOfWeek) });
    }

    const [data, total] = await qb
      .orderBy('slot.day_of_week', 'ASC')
      .addOrderBy('slot.order_index', 'ASC', 'NULLS LAST')
      .addOrderBy('slot.start_time', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async calendar(ctx: RequestContext, branchId: string, dayOfWeek?: number): Promise<TimeSlot[]> {
    assertTenantScope(ctx, 'time_slots');
    const qb = this.repository
      .createQueryBuilder('slot')
      .where('slot.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('slot.branch_id = :branchId', { branchId })
      .andWhere('slot.status = :status', { status: TimeSlotStatus.ACTIVE });
    if (dayOfWeek !== undefined) qb.andWhere('slot.day_of_week = :dayOfWeek', { dayOfWeek });
    return qb
      .orderBy('slot.day_of_week', 'ASC')
      .addOrderBy('slot.order_index', 'ASC', 'NULLS LAST')
      .addOrderBy('slot.start_time', 'ASC')
      .getMany();
  }

  async findById(
    ctx: RequestContext,
    id: string,
    includeInactive = false,
    lockForUpdate = false,
  ): Promise<TimeSlot | null> {
    assertTenantScope(ctx, 'time_slots');
    const qb = this.repository
      .createQueryBuilder('slot')
      .where('slot.id = :id AND slot.tenant_id = :tenantId', { id, tenantId: ctx.tenantId });
    if (!includeInactive) qb.andWhere('slot.status = :status', { status: TimeSlotStatus.ACTIVE });
    if (lockForUpdate) qb.setLock('pessimistic_write');
    return qb.getOne();
  }

  async branchExistsInTenant(ctx: RequestContext, branchId: string): Promise<boolean> {
    assertTenantScope(ctx, 'branches');
    const branch = await this.repository.manager
      .createQueryBuilder()
      .select('1', 'exists')
      .from('branches', 'branch')
      .where('branch.id = :branchId AND branch.tenant_id = :tenantId', { branchId, tenantId: ctx.tenantId })
      .andWhere('branch.status = :status', { status: 'active' })
      .andWhere('branch.deleted_at IS NULL')
      .getRawOne<{ exists: string }>();
    return Boolean(branch);
  }

  async findDuplicate(
    ctx: RequestContext,
    branchId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<TimeSlot | null> {
    assertTenantScope(ctx, 'time_slots');
    const qb = this.repository
      .createQueryBuilder('slot')
      .where('slot.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('slot.branch_id = :branchId', { branchId })
      .andWhere('slot.day_of_week = :dayOfWeek', { dayOfWeek })
      .andWhere('slot.start_time = :startTime', { startTime })
      .andWhere('slot.end_time = :endTime', { endTime })
      .andWhere('slot.status = :status', { status: TimeSlotStatus.ACTIVE });
    if (excludeId) qb.andWhere('slot.id != :excludeId', { excludeId });
    return qb.getOne();
  }

  async findOverlap(
    ctx: RequestContext,
    branchId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<TimeSlot | null> {
    assertTenantScope(ctx, 'time_slots');
    const qb = this.repository
      .createQueryBuilder('slot')
      .where('slot.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('slot.branch_id = :branchId', { branchId })
      .andWhere('slot.day_of_week = :dayOfWeek', { dayOfWeek })
      .andWhere('slot.start_time < :endTime', { endTime })
      .andWhere('slot.end_time > :startTime', { startTime })
      .andWhere('slot.status = :status', { status: TimeSlotStatus.ACTIVE });
    if (excludeId) qb.andWhere('slot.id != :excludeId', { excludeId });
    return qb.getOne();
  }

  async create(ctx: RequestContext, values: TimeSlotCreateValues): Promise<TimeSlot> {
    assertTenantScope(ctx, 'time_slots');
    const slot = this.repository.create({
      tenantId: ctx.tenantId,
      ...values,
      status: TimeSlotStatus.ACTIVE,
      archivedAt: null,
    });
    return this.repository.save(slot);
  }

  async save(slot: TimeSlot): Promise<TimeSlot> {
    return this.repository.save(slot);
  }
}
