import { RequestContext } from '../context/request-context';
import { assertTenantScope } from './assert-tenant-scope';
import { CrossTenantAccessError, TenantScopeRequiredError } from './tenant-scope.error';
import { TENANT_KEYS, omitTenantKeys } from './tenant-query.helper';

/**
 * A minimal, dependency-free tenant-scoped repository used as the reference
 * implementation for tenant isolation hardening. It is intentionally backed by
 * an injectable record store so it can be unit tested without a database, while
 * demonstrating the exact invariants every real repository must uphold:
 *
 *  1. No operation may run without a resolved tenant scope.
 *  2. Caller-supplied tenant keys are stripped (cannot be forged).
 *  3. Reads/writes are always scoped to the request tenant.
 *  4. Updates/deletes verify, by re-reading the record, that the target row
 *     belongs to the request tenant — preventing cross-tenant mutation by id.
 */

export type InMemoryTenantRepositoryOptions = {
  tableName: string;
  resourceName?: string;
  idColumn?: string;
  tenantColumn?: 'tenantId' | 'tenant_id';
};

export interface RecordStore {
  all(): Array<Record<string, unknown>>;
  put(record: Record<string, unknown>): void;
  remove(predicate: (record: Record<string, unknown>) => boolean): number;
}

export class InMemoryRecordStore implements RecordStore {
  private readonly rows: Array<Record<string, unknown>> = [];

  all(): Array<Record<string, unknown>> {
    return this.rows;
  }

  put(record: Record<string, unknown>): void {
    this.rows.push(record);
  }

  remove(predicate: (record: Record<string, unknown>) => boolean): number {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (predicate(this.rows[i])) {
        this.rows.splice(i, 1);
      }
    }
    return before - this.rows.length;
  }
}

export class TenantScopedInMemoryRepository {
  protected readonly tableName: string;
  protected readonly resourceName: string;
  protected readonly idColumn: string;
  protected readonly tenantColumn: 'tenantId' | 'tenant_id';

  constructor(
    protected readonly store: RecordStore,
    options: InMemoryTenantRepositoryOptions,
  ) {
    this.tableName = options.tableName;
    this.resourceName = options.resourceName ?? options.tableName;
    this.idColumn = options.idColumn ?? 'id';
    this.tenantColumn = options.tenantColumn ?? 'tenant_id';
  }

  private requireTenant(ctx: RequestContext): string {
    assertTenantScope(ctx, this.resourceName);
    return ctx.tenantId as string;
  }

  private matchTenant(record: Record<string, unknown>, tenantId: string): boolean {
    return String(record[this.tenantColumn]) === tenantId;
  }

  async create(ctx: RequestContext, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tenantId = this.requireTenant(ctx);
    const safe = omitTenantKeys(data);
    const record: Record<string, unknown> = {
      ...safe,
      [this.tenantColumn]: tenantId,
    };
    if (record[this.idColumn] === undefined) {
      record[this.idColumn] = `row_${this.store.all().length + 1}`;
    }
    this.store.put(record);
    return record;
  }

  async findById(ctx: RequestContext, id: string): Promise<Record<string, unknown> | null> {
    const tenantId = this.requireTenant(ctx);
    const record = this.store
      .all()
      .find((row) => String(row[this.idColumn]) === String(id) && this.matchTenant(row, tenantId));
    return record ?? null;
  }

  async findMany(
    ctx: RequestContext,
    filters: Record<string, unknown> = {},
  ): Promise<Array<Record<string, unknown>>> {
    const tenantId = this.requireTenant(ctx);
    const safeFilters = omitTenantKeys(filters);
    return this.store
      .all()
      .filter(
        (row) =>
          this.matchTenant(row, tenantId) &&
          Object.entries(safeFilters).every(([key, value]) => row[key] === value),
      );
  }

  async update(ctx: RequestContext, id: string, data: Record<string, unknown>): Promise<void> {
    const tenantId = this.requireTenant(ctx);
    if (TENANT_KEYS.some((key) => data[key] !== undefined && String(data[key]) !== tenantId)) {
      throw new CrossTenantAccessError({ resourceName: this.resourceName, expectedTenantId: tenantId });
    }
    const safe = omitTenantKeys(data);
    const target = this.store
      .all()
      .find((row) => String(row[this.idColumn]) === String(id) && this.matchTenant(row, tenantId));
    if (!target) {
      // Do not leak existence: same response as "not found in my tenant".
      throw new CrossTenantAccessError({ resourceName: this.resourceName, expectedTenantId: tenantId });
    }
    Object.assign(target, safe);
  }

  async remove(ctx: RequestContext, id: string): Promise<void> {
    const tenantId = this.requireTenant(ctx);
    const removed = this.store.remove(
      (row) => String(row[this.idColumn]) === String(id) && this.matchTenant(row, tenantId),
    );
    if (removed === 0) {
      throw new CrossTenantAccessError({ resourceName: this.resourceName, expectedTenantId: tenantId });
    }
  }

  /** Exposed for tests / diagnostics only — never returns cross-tenant rows. */
  get rawStore(): RecordStore {
    return this.store;
  }
}

export { TenantScopeRequiredError, CrossTenantAccessError };
