import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import { Room, RoomStatus } from './room.entity';

export type RoomListQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
  branchId?: string;
  includeInactive?: string | boolean;
};

export type RoomCreateValues = Pick<Room, 'branchId' | 'name' | 'code' | 'capacity' | 'description'>;

export type PaginatedRooms = {
  data: Room[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function normalizePositiveInt(value: string | number | undefined, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeBoolean(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}

@Injectable()
export class RoomRepository {
  constructor(@InjectRepository(Room) private readonly repository: Repository<Room>) {}

  async list(ctx: RequestContext, query: RoomListQuery = {}): Promise<PaginatedRooms> {
    assertTenantScope(ctx, 'rooms');
    const page = normalizePositiveInt(query.page, 1, 10_000);
    const limit = normalizePositiveInt(query.limit, 20, 100);
    const includeInactive = normalizeBoolean(query.includeInactive);
    const qb = this.repository
      .createQueryBuilder('room')
      .where('room.tenant_id = :tenantId', { tenantId: ctx.tenantId });

    if (query.branchId) qb.andWhere('room.branch_id = :branchId', { branchId: query.branchId });
    if (!includeInactive) qb.andWhere('room.status = :status', { status: RoomStatus.ACTIVE });

    const search = query.search?.trim().toLowerCase();
    if (search) {
      qb.andWhere("(LOWER(room.name) LIKE :search OR LOWER(COALESCE(room.code, '')) LIKE :search)", { search: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy('room.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(ctx: RequestContext, id: string, includeInactive = false): Promise<Room | null> {
    assertTenantScope(ctx, 'rooms');
    const qb = this.repository
      .createQueryBuilder('room')
      .where('room.id = :id AND room.tenant_id = :tenantId', { id, tenantId: ctx.tenantId });
    if (!includeInactive) qb.andWhere('room.status = :status', { status: RoomStatus.ACTIVE });
    return qb.getOne();
  }

  async existsByIdInTenant(ctx: RequestContext, id: string): Promise<boolean> {
    assertTenantScope(ctx, 'rooms');
    const count = await this.repository
      .createQueryBuilder('room')
      .where('room.id = :id AND room.tenant_id = :tenantId', { id, tenantId: ctx.tenantId })
      .getCount();
    return count > 0;
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

  async findByCode(ctx: RequestContext, branchId: string, code: string, excludeId?: string): Promise<Room | null> {
    assertTenantScope(ctx, 'rooms');
    const qb = this.repository
      .createQueryBuilder('room')
      .where('room.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('room.branch_id = :branchId', { branchId })
      .andWhere('LOWER(room.code) = :code', { code: code.toLowerCase() })
      .andWhere('room.status = :status', { status: RoomStatus.ACTIVE });
    if (excludeId) qb.andWhere('room.id != :excludeId', { excludeId });
    return qb.getOne();
  }

  async findByName(ctx: RequestContext, branchId: string, name: string, excludeId?: string): Promise<Room | null> {
    assertTenantScope(ctx, 'rooms');
    const qb = this.repository
      .createQueryBuilder('room')
      .where('room.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('room.branch_id = :branchId', { branchId })
      .andWhere('LOWER(room.name) = :name', { name: name.toLowerCase() })
      .andWhere('room.status = :status', { status: RoomStatus.ACTIVE });
    if (excludeId) qb.andWhere('room.id != :excludeId', { excludeId });
    return qb.getOne();
  }

  async create(ctx: RequestContext, values: RoomCreateValues): Promise<Room> {
    assertTenantScope(ctx, 'rooms');
    const room = this.repository.create({
      tenantId: ctx.tenantId,
      branchId: values.branchId,
      name: values.name,
      code: values.code,
      capacity: values.capacity,
      description: values.description,
      status: RoomStatus.ACTIVE,
      deactivatedAt: null,
    });
    return this.repository.save(room);
  }

  async save(room: Room): Promise<Room> {
    return this.repository.save(room);
  }
}
