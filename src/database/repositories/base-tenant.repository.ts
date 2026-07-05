import { InsertResult, UpdateResult } from 'typeorm';
import { RequestContext } from '../../common/context/request-context';
import { assertTenantScope } from '../../common/tenant/assert-tenant-scope';
import { TenantColumnName, omitTenantKeys, tenantData, tenantWhere } from '../../common/tenant/tenant-query.helper';

export type TenantScopedRepositoryOptions = {
  tableName: string;
  resourceName?: string;
  idColumn?: string;
  tenantColumn?: TenantColumnName;
};

export type TenantScopedFilters = Record<string, unknown>;
export type TenantScopedCreateInput = Record<string, unknown>;
export type TenantScopedUpdateInput = Record<string, unknown>;

type TenantScopedManager = {
  find(tableName: string, options: { where: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
  findOne(tableName: string, options: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  insert(tableName: string, values: Record<string, unknown>): Promise<Pick<InsertResult, 'generatedMaps'>>;
  update(tableName: string, where: Record<string, unknown>, values: Record<string, unknown>): Promise<Pick<UpdateResult, 'affected'>>;
};

export class BaseTenantRepository<TRecord extends Record<string, unknown> = Record<string, unknown>> {
  protected readonly tableName: string;
  protected readonly resourceName: string;
  protected readonly idColumn: string;
  protected readonly tenantColumn: TenantColumnName;

  constructor(
    protected readonly manager: TenantScopedManager,
    options: TenantScopedRepositoryOptions,
  ) {
    this.tableName = options.tableName;
    this.resourceName = options.resourceName ?? options.tableName;
    this.idColumn = options.idColumn ?? 'id';
    this.tenantColumn = options.tenantColumn ?? 'tenant_id';
  }

  async findById(ctx: RequestContext, id: string): Promise<TRecord | null> {
    const where = tenantWhere(ctx, { [this.idColumn]: id }, this.resourceName, this.tenantColumn);
    return this.manager.findOne(this.tableName, { where }) as Promise<unknown> as Promise<TRecord | null>;
  }

  async findMany(ctx: RequestContext, filters: TenantScopedFilters = {}): Promise<TRecord[]> {
    const where = tenantWhere(ctx, filters, this.resourceName, this.tenantColumn);
    return this.manager.find(this.tableName, { where }) as Promise<unknown> as Promise<TRecord[]>;
  }

  async create(ctx: RequestContext, data: TenantScopedCreateInput): Promise<TRecord> {
    const values = tenantData(ctx, data, this.resourceName, this.tenantColumn);
    const result = await this.manager.insert(this.tableName, values);
    return (result.generatedMaps[0] ?? values) as TRecord;
  }

  async update(ctx: RequestContext, id: string, data: TenantScopedUpdateInput): Promise<void> {
    assertTenantScope(ctx, this.resourceName);
    const where = tenantWhere(ctx, { [this.idColumn]: id }, this.resourceName, this.tenantColumn);
    await this.manager.update(this.tableName, where, omitTenantKeys(data));
  }

  async softDelete(ctx: RequestContext, id: string): Promise<void> {
    await this.update(ctx, id, { deleted_at: new Date() });
  }
}

export const TENANT_SCOPED_TABLES = [
  'branches',
  'tenant_settings',
  'tenant_memberships',
  'roles',
  'user_roles',
  'user_sessions',
  'audit_logs',
  'teachers',
  'teacher_branch_assignments',
  'courses',
  'rooms',
  'student_groups',
  'students',
  'time_slots',
  'teacher_availability',
  'group_course_requirements',
  'schedule_drafts',
  'schedule_draft_events',
  'published_schedules',
  'published_schedule_events',
  'leave_requests',
  'leave_request_impacts',
  'substitution_assignments',
  'attendance_sessions',
  'attendance_records',
  'message_templates',
  'parent_notifications',
  'kvkk_consent_subjects',
  'kvkk_consents',
  'kvkk_consent_events',
] as const;

export const GLOBAL_TABLES = ['users', 'permissions', 'migrations'] as const;
