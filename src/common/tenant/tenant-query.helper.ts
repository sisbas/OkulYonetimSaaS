import { RequestContext } from '../context/request-context';
import { assertTenantScope } from './assert-tenant-scope';
import { CrossTenantAccessError } from './tenant-scope.error';

export type TenantColumnName = 'tenantId' | 'tenant_id';

export const TENANT_KEYS: ReadonlyArray<string> = ['tenantId', 'tenant_id'];

export function isTenantKey(key: string): boolean {
  return TENANT_KEYS.includes(key);
}

/**
 * Tüm kiracı anahtarı alias'larını (tenantId, tenant_id, ...) bir kayıttan/gövdeden
 * toplar. Çift alias ({tenantId, tenant_id}) çakışması gibi durumları yakalamak için
 * kullanılır. Yalnızca TANIMLI (undefined/null olmayan) değerler döndürülür.
 *
 * `headerTenantId` ve `jwtTenantId` isteğe bağlıdır; istek çözümlemesinde başlık ve
 * token alias'larını da aynı kontrol kümesine katmak için kullanılır.
 */
export function collectTenantKeyValues(input: {
  body?: Record<string, unknown> | null;
  headerTenantId?: string | undefined;
  jwtTenantId?: string | undefined;
}): string[] {
  const values: string[] = [];
  const pushIfDefined = (v: unknown) => {
    if (v !== undefined && v !== null) values.push(String(v));
  };
  if (input.body) {
    for (const key of TENANT_KEYS) pushIfDefined(input.body[key]);
  }
  pushIfDefined(input.headerTenantId);
  pushIfDefined(input.jwtTenantId);
  return values;
}

/**
 * Verilen kiracı değerleri arasında çakışma (farklı kiracı id'leri aynı istekte
 * bulunması) var mı kontrol eder. Tüm değerler aynıysa çakışma yoktur.
 * Boş tek-elemanlı liste güvenlidir (çakışma yok).
 */
export function hasTenantKeyConflict(values: string[]): boolean {
  if (values.length <= 1) return false;
  const first = values[0];
  return values.some((v) => v !== first);
}

/** Normalize a tenant column name (tenantId, tenant_id, etc.) to the requested column name. */
export function normalizeTenantKey(key: string, target: TenantColumnName): TenantColumnName {
  if (key !== 'tenantId' && key !== 'tenant_id') {
    throw new Error(`Not a tenant key: ${key}`);
  }
  return target;
}

type AnyRecord = Record<string, unknown>;

export function omitTenantKeys<T extends AnyRecord>(input?: T): Omit<T, 'tenantId' | 'tenant_id'> {
  if (!input) return {} as Omit<T, 'tenantId' | 'tenant_id'>;
  const { tenantId: _tenantId, tenant_id: _tenant_id, ...safeInput } = input;
  return safeInput;
}

/**
 * Inspect a caller-supplied object for any tenant identifier key. Returns the
 * supplied value (so callers can decide whether to strip it) WITHOUT throwing.
 *
 * NOTE: For fail-safe writer isolation the helpers `tenantWhere`/`tenantData`
 * deliberately *ignore* any foreign tenant value and always re-stamp the
 * request tenant (see `omitTenantKeys`). The strict, throwing variant lives in
 * `assertNoCrossTenantTenantKey` and in the repository layer, so a hostile
 * payload can never route writes/reads to a foreign tenant while the broad
 * helper surface stays backwards compatible with existing silent-override
 * callers.
 */
export function detectConflictingTenantKeys(
  ctx: RequestContext,
  input: AnyRecord | undefined,
  _resourceName = 'tenant-scoped-resource',
): string | undefined {
  if (!input) return undefined;
  const supplied = TENANT_KEYS.map((key) => input[key]).find((value) => value !== undefined);
  if (supplied === undefined) return undefined;
  return supplied as string;
}

/** Convenience assertion used by repositories/guards before applying caller input. */
export function assertNoCrossTenantTenantKey(
  ctx: RequestContext,
  input: AnyRecord | undefined,
  resourceName = 'tenant-scoped-resource',
): void {
  if (!input) return;

  // Yalnızca ilk tanımlı alias'ı kontrol etmek YETERSİZ. Tüm kiracı alias
  // değerleri toplanır; aralarında çakışma (farklı kiracı id) varsa VEYA
  // herhangi biri istek kiracısından farklıysa 403 reddedilir.
  const values = collectTenantKeyValues({ body: input });
  if (values.length === 0) return;

  if (hasTenantKeyConflict(values)) {
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }

  if (ctx.tenantId && values[0] !== ctx.tenantId) {
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }
}

export function tenantWhere<T extends AnyRecord>(
  ctx: RequestContext,
  where?: T,
  resourceName = 'tenant-scoped-resource',
  tenantColumn: TenantColumnName = 'tenant_id',
): Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string> {
  assertTenantScope(ctx, resourceName);
  // Fail-safe: any caller-supplied tenant key is stripped and the request
  // tenant is authoritative — a forged tenant can never leak into the query.
  return {
    ...omitTenantKeys(where),
    [tenantColumn]: ctx.tenantId,
  } as Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string>;
}

export function tenantData<T extends AnyRecord>(
  ctx: RequestContext,
  data: T,
  resourceName = 'tenant-scoped-resource',
  tenantColumn: TenantColumnName = 'tenant_id',
): Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string> {
  assertTenantScope(ctx, resourceName);
  return {
    ...omitTenantKeys(data),
    [tenantColumn]: ctx.tenantId,
  } as Omit<T, 'tenantId' | 'tenant_id'> & Record<TenantColumnName, string>;
}
