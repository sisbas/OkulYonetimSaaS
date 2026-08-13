import {
  AuditActionFilter,
  RedactionReceipt,
  TenantScopedAuditQuery,
  TenantScopedAuditRow,
} from './transactional-audit.types';

// KVKK kapsamında audit satırlarından okuma anında maskelenen PII alan adları.
// Mevcut test/kvkk/audit-redaction.spec.ts ile tutarlı (password, refreshToken,
// accessToken, token, email, phone) ve OkulSaas domain PII alanlarıyla genişletilmiştir.
export const AUDIT_PII_KEYS: ReadonlySet<string> = new Set([
  'password',
  'refreshToken',
  'accessToken',
  'token',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'email',
  'phone',
  'studentName',
  'studentIdentity',
  'studentTcKimlikNo',
  'nationalId',
  'identityNumber',
  'tcKimlikNo',
  'birthDate',
  'address',
  'iban',
  'parentName',
  'parentPhone',
  'parentEmail',
  'parentContact',
  'guardianName',
  'guardianPhone',
  'guardianEmail',
  'guardianContact',
  'teacherName',
  'teacherEmail',
  'teacherPhone',
  'messageBody',
  'notificationBody',
  'notificationPayload',
  'counselingNote',
  'guidanceNote',
  'healthNote',
  'medicalNote',
  'diagnosis',
  // --- İhraç (export) sızıntı bulgusu (PR #227 P1): aşağıdaki yasaklı anahtarlar
  // FORBIDDEN_AUDIT_METADATA_KEYS'te yer alıyordu ancak ihraç maskesine dahil
  // değildi; bu nedenle export'ta ham (maskesiz) kalıyorlardı. KVKK kapsamında
  // PII/hassas veri sızıntısını önlemek için ihraç maskesine ekleniyorlar.
  'credential', // kimlik bilgisi / parola benzeri hassas değer
  'setCookie', // oturum çerezi (session fixation / hijack riski)
  'requestBody', // ham istek gövdesi (gövdede PII taşınabilir)
  'healthDetail', // sağlık özel nitelikli kişisel veri
  'healthInfo', // sağlık özel nitelikli kişisel veri
  'leaveDetail', // izin/rapor detayı (sağlık/özel hayat)
  'freeTextReason', // serbest metin gerekçe (özel hayatın gizliliği)
]);

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

export type BuiltAuditQuery = Readonly<{
  sql: string;
  params: unknown[];
}>;

/**
 * Bir action filtresinin (tam ad, 'aile.*' jokeri veya '*') verilen action ile
 * eşleşip eşleşmediğini döndürür. SQL'de joker ifade edilemediği için tam adlar
 * `IN`, joker aileler `LIKE 'aile.%'` olarak sorguya çevrilir (bkz. buildTenantScopedAuditQuery).
 */
export function matchesActionFilter(action: string, filter: AuditActionFilter): boolean {
  if (filter === '*') return true;
  if (filter === action) return true;
  if (filter.endsWith('.*')) {
    const prefix = filter.slice(0, -1); // 'auth.' gibi
    return action.startsWith(prefix);
  }
  return false;
}

function assertTenantScopedQuery(query: TenantScopedAuditQuery): void {
  if (!query.tenantId || typeof query.tenantId !== 'string' || query.tenantId.length === 0) {
    throw new TypeError('tenantId is required for tenant-scoped audit queries (tenant isolation)');
  }
}

/**
 * Tenant'a özgü audit sorgusunu parametreli, güvenli bir SQL'e çevirir.
 * `tenant_id` her zaman WHERE cümlesinde yer alır — audit logları tenant sınırının
 * dışına asla sızamaz. Joker action filtreleri (`auth.*`) `LIKE` ile, tam adlar
 * `IN` ile çevrilir. Tüm değerler parametreli olduğundan SQL enjeksiyonuna kapalıdır.
 */
export function buildTenantScopedAuditQuery(query: TenantScopedAuditQuery): BuiltAuditQuery {
  assertTenantScopedQuery(query);

  const clauses: string[] = ['tenant_id = $1'];
  const params: unknown[] = [query.tenantId];
  let p = 2;

  if (query.entityType !== undefined) {
    clauses.push(`entity_type = $${p}`);
    params.push(query.entityType);
    p += 1;
  }
  if (query.entityId !== undefined) {
    clauses.push(`entity_id = $${p}`);
    params.push(query.entityId);
    p += 1;
  }
  if (query.actorUserId !== undefined) {
    clauses.push(`actor_user_id = $${p}`);
    params.push(query.actorUserId);
    p += 1;
  }

  const actions = query.actions ?? [];
  const hasWildcardAll = actions.includes('*');
  if (!hasWildcardAll && actions.length > 0) {
    const actionConditions: string[] = [];
    for (const filter of actions) {
      if (filter.endsWith('.*')) {
        actionConditions.push(`action LIKE $${p}`);
        params.push(`${filter.slice(0, -1)}%`);
        p += 1;
      } else if (filter !== '*') {
        actionConditions.push(`action = $${p}`);
        params.push(filter);
        p += 1;
      }
    }
    if (actionConditions.length > 0) {
      clauses.push(`(${actionConditions.join(' OR ')})`);
    }
  }

  if (query.fromCreatedAt !== undefined) {
    clauses.push(`created_at >= $${p}`);
    params.push(query.fromCreatedAt);
    p += 1;
  }
  if (query.toCreatedAt !== undefined) {
    clauses.push(`created_at <= $${p}`);
    params.push(query.toCreatedAt);
    p += 1;
  }

  const limit = Math.min(Math.max(Math.floor(query.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const offset = Math.max(Math.floor(query.offset ?? 0), 0);

  const sql = `
    SELECT id, tenant_id, actor_user_id, actor_session_id, action, entity_type,
           entity_id, request_id, metadata_json, created_at
    FROM audit_logs
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return { sql, params };
}

type MaskCounters = { redacted: number; skipped: number };

/**
 * KVKK PII maskeleme — özyinelemeli. PII anahtarlı alanlar '[REDACTED]' ile değiştirilir,
 * geri kalan alanlar (ve iç içe nesneler) incelenerek sayaçlar güncellenir.
 * Bu fonksiyon salt okunur bir dönüşüm olup orijinal nesneyi mutasyona uğratmaz.
 */
export function maskPiiRecursive(value: unknown, counters: MaskCounters = { redacted: 0, skipped: 0 }): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskPiiRecursive(item, counters));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (AUDIT_PII_KEYS.has(key)) {
        counters.redacted += 1;
        out[key] = '[REDACTED]';
      } else {
        counters.skipped += 1;
        out[key] = maskPiiRecursive(nested, counters);
      }
    }
    return out;
  }
  return value;
}

export type RedactedAuditRow = Readonly<{
  row: TenantScopedAuditRow;
  receipt: RedactionReceipt;
}>;

/**
 * Bir audit satırını dışa aktarım/okuma öncesi KVKK maskesinden geçirir ve
 * maskelemenin denetlenebilir kanıtını (RedactionReceipt) döndürür.
 * `redactedFieldCount + skippedFieldCount === evaluatedFieldCount` olacak şekilde
 * sayaç tutulur; bu, denetçinin "maskelenmeyen PII kalmadı" çıkarımını yapmasını sağlar.
 */
export function redactAuditRowForExport(row: TenantScopedAuditRow): RedactedAuditRow {
  const counters: MaskCounters = { redacted: 0, skipped: 0 };
  const metadataJson = row.metadataJson
    ? (maskPiiRecursive(row.metadataJson, counters) as Record<string, unknown>)
    : null;

  const receipt: RedactionReceipt = {
    redactedFieldCount: counters.redacted,
    skippedFieldCount: counters.skipped,
    evaluatedFieldCount: counters.redacted + counters.skipped,
    strategy: counters.redacted > 0 ? 'full-redact' : 'none',
    appliedAt: new Date().toISOString(),
  };

  return {
    row: { ...row, metadataJson },
    receipt,
  };
}

/** Çoklu satır için toplu KVKK maskesi + birleşik kanıt özeti. */
export function redactAuditRowsForExport(rows: readonly TenantScopedAuditRow[]): RedactedAuditRow[] {
  return rows.map((row) => redactAuditRowForExport(row));
}
