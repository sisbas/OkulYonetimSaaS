import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import { Course, CourseStatus } from './course.entity';

export type CourseListQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
  includeInactive?: string | boolean;
};

export type PaginatedCourses = {
  data: Course[];
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
export class CourseRepository {
  constructor(@InjectRepository(Course) private readonly repository: Repository<Course>) {}

  async list(ctx: RequestContext, query: CourseListQuery = {}): Promise<PaginatedCourses> {
    assertTenantScope(ctx, 'courses');
    const page = normalizePositiveInt(query.page, 1, 10_000);
    const limit = normalizePositiveInt(query.limit, 20, 100);
    const includeInactive = normalizeBoolean(query.includeInactive);
    const qb = this.repository
      .createQueryBuilder('course')
      .where('course.tenant_id = :tenantId', { tenantId: ctx.tenantId });

    if (!includeInactive) qb.andWhere('course.status = :status', { status: CourseStatus.ACTIVE });

    const search = query.search?.trim().toLowerCase();
    if (search) {
      qb.andWhere("(LOWER(course.name) LIKE :search OR LOWER(COALESCE(course.code, '')) LIKE :search)", { search: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy('course.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(ctx: RequestContext, id: string, includeInactive = false): Promise<Course | null> {
    assertTenantScope(ctx, 'courses');
    const qb = this.repository
      .createQueryBuilder('course')
      .where('course.id = :id AND course.tenant_id = :tenantId', { id, tenantId: ctx.tenantId });
    if (!includeInactive) qb.andWhere('course.status = :status', { status: CourseStatus.ACTIVE });
    return qb.getOne();
  }

  async existsByIdInTenant(ctx: RequestContext, id: string): Promise<boolean> {
    assertTenantScope(ctx, 'courses');
    const count = await this.repository
      .createQueryBuilder('course')
      .where('course.id = :id AND course.tenant_id = :tenantId', { id, tenantId: ctx.tenantId })
      .getCount();
    return count > 0;
  }

  async existsByIdAnyTenant(id: string): Promise<boolean> {
    const count = await this.repository
      .createQueryBuilder('course')
      .where('course.id = :id', { id })
      .getCount();
    return count > 0;
  }

  async findByCode(ctx: RequestContext, code: string, excludeId?: string): Promise<Course | null> {
    assertTenantScope(ctx, 'courses');
    const qb = this.repository
      .createQueryBuilder('course')
      .where('course.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('LOWER(course.code) = :code', { code: code.toLowerCase() });
    if (excludeId) qb.andWhere('course.id != :excludeId', { excludeId });
    return qb.getOne();
  }

  async create(ctx: RequestContext, values: Pick<Course, 'name' | 'code' | 'description'>): Promise<Course> {
    assertTenantScope(ctx, 'courses');
    const course = this.repository.create({
      tenantId: ctx.tenantId,
      name: values.name,
      code: values.code,
      description: values.description,
      status: CourseStatus.ACTIVE,
      deactivatedAt: null,
    });
    return this.repository.save(course);
  }

  async save(course: Course): Promise<Course> {
    return this.repository.save(course);
  }
}
