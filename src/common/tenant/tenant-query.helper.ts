import { RequestContext } from '../context/request-context';
import { assertTenantScope } from './assert-tenant-scope';
import { CrossTenantAccessError } from './tenant-scope.error';

export type TenantColumnName = 'tenantId' | 'tenant_id';

export const TENANT_KEYS: ReadonlyArray<string> = ['tenantId', 'tenant_id'];

/**
 * Geçersiz/tanımsız (null veya undefined) kiracı damgasını temsil eden sentinel.
 * Gerçek kiracı id'leri UUID formatında olduğundan bu değer hiçbir gerçek id
 * ile eşleşmez; dolayısıyla çağrı noktasında "yabancı/geçersiz tenant" olarak
 * reddedilmesini sağlar (fail-closed).
 */
export const FOREIGN_TENANT_SENTINEL = '__tenant_unstamped__';

export function isTenantKey(key: string): boolean {
  return TENANT_KEYS.includes(key);
}

/**
 * Tüm kiracı anahtarı alias'larını (tenantId, tenant_id, ...) bir kayıttan/gövdeden
 * toplar. Çift alias ({tenantId, tenant_id}) çakışması gibi durumları yakalamak için
 * kullanılır.
 *
 * ÖNEMLİ (KVKK / fail-closed): Gövdedeki bir kiracı anahtarı null veya undefined
 * ise bu "geçersiz/tanımsız damga" kabul edilir ve FOREIGN_TENANT_SENTINEL ile
 * işaretlenir. Böylece çağrı noktası (assertNoCrossTenantTenantKey /
 * assertNoForeignTenantInRecord) bu durumu yabancı/geçersiz tenant sayıp 403
 * üretir; boş liste döndürüp sessizce geçmek (fail-open) engellenir.
 *
 * `headerTenantId` ve `jwtTenantId` isteğe bağlıdır; istek çözümlemesinde başlık ve
 * token alias'larını da aynı kontrol kümesine katmak için kullanılır. Bunlar
 * çözümleme katmanında (tenant-bootstrap) zaten doğrulandığından yalnızca
 * tanımlı değerler eklenir.
 */
export function collectTenantKeyValues(input: {
  body?: Record<string, unknown> | null;
  headerTenantId?: string | undefined;
  jwtTenantId?: string | undefined;
}): string[] {
  const values: string[] = [];
  // Gövde içindeki null/undefined kiracı damgasını sentinel ile işaretle.
  // Yalnızca GÖVDEDE MEVCUT olan anahtarlar dikkate alınır; hiç gönderilmemiş
  // (absent) anahtarlar atlanır (ör. yalnızca tenant_id geldiğinde tenantId
  // yok sayılır). Mevcut ama null/undefined olan damga ise "geçersiz/foreign"
  // kabul edilir ve FOREIGN_TENANT_SENTINEL ile işaretlenir.
  if (input.body) {
    for (const key of TENANT_KEYS) {
      if (key in input.body) {
        const v = input.body[key];
        if (v === undefined || v === null) {
          values.push(FOREIGN_TENANT_SENTINEL);
        } else {
          values.push(String(v));
        }
      }
    }
  }
  const pushIfDefined = (v: unknown) => {
    if (v !== undefined && v !== null) values.push(String(v));
  };
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

  // Kapsam (tenantId) yoksa isteğin hangi kiracıya ait olduğu belirsizdir.
  // Fail-open yerine fail-closed: kapsam çözümlenemediği için 403 (cross-tenant)
  // üretilir (KVKK: PII sızıntısını önlemek için varsayılan olarak reddet).
  if (!ctx.tenantId) {
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }

  // Yalnızca ilk tanımlı alias'ı kontrol etmek YETERSİZ. Tüm kiracı alias
  // değerleri toplanır; aralarında çakışma (farklı kiracı id) varsa VEYA
  // herhangi biri istek kiracısından farklıysa (ya da null/undefined damga
  // FOREIGN_TENANT_SENTINEL ile işaretlendiyse) 403 reddedilir.
  const values = collectTenantKeyValues({ body: input });
  if (values.length === 0) return;

  if (hasTenantKeyConflict(values)) {
    throw new CrossTenantAccessError({ resourceName, expectedTenantId: ctx.tenantId });
  }

  // Tek değer (veya hepsi aynı) olsa bile istek kiracısıyla eşleşmeli.
  // FOREIGN_TENANT_SENTINEL (null/undefined damga) hiçbir gerçek id ile
  // eşleşmeyeceğinden burada otomatik olarak reddedilir.
  if (values[0] !== ctx.tenantId) {
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
