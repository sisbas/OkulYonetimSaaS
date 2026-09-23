/**
 * Audit retention politikası (#259).
 *
 * Varsayılan saklama süresi **7 yıl** (2555 gün); aksiyon aileleri için
 * yapılandırılabilir. Politika kod içinde açık bir kayıt (registry) olarak
 * tutulur; üretimde varsayılan `AUDIT_RETENTION_DEFAULT_DAYS` env'i ile
 * geçersiz kılınabilir. Geçersiz/negatif değer **fail-closed** reddedilir.
 *
 * KVKK/denetim notu: saklama süresi dolan kayıtlar silinmeden önce zincir
 * checkpoint'i yazılır (`audit_chain_checkpoints`); böylece kırpılan geçmişin
 * bütünlüğü kanıtlanabilir kalır (bkz. AuditRetentionService).
 */

/** 7 yıl (KVKK/ticari defter saklama varsayılanı). */
export const DEFAULT_AUDIT_RETENTION_DAYS = 2555;

export const AUDIT_RETENTION_DEFAULT_DAYS_ENV = 'AUDIT_RETENTION_DEFAULT_DAYS';

/**
 * Aksiyon ailesi (prefix) bazlı saklama süreleri. En uzun eşleşen prefix
 * kazanır; burada tanımlı olmayan aileler varsayılan süreyi kullanır.
 */
export const AUDIT_RETENTION_FAMILY_DAYS: Readonly<Record<string, number>> = {
  'auth.': 3650, // güvenlik olayları 10 yıl (hesap verebilirlik)
  'dataprotection.': 3650, // KVKK veri koruma kanıtı 10 yıl
};

const MAX_RETENTION_DAYS = 3650;

function parseRetentionDays(raw: string | undefined, source: string): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `FATAL: ${source} must be a positive integer number of days (received '${raw}').`,
    );
  }
  if (parsed > MAX_RETENTION_DAYS) {
    throw new Error(
      `FATAL: ${source} must be <= ${MAX_RETENTION_DAYS} days (received '${raw}').`,
    );
  }
  return parsed;
}

function familyFor(action: string): string | null {
  const families = Object.keys(AUDIT_RETENTION_FAMILY_DAYS)
    .filter((prefix) => action.startsWith(prefix))
    .sort((a, b) => b.length - a.length);
  return families[0] ?? null;
}

/**
 * Bir aksiyon için geçerli saklama süresini (gün) çözer.
 * Öncelik: aile kaydı → env varsayılanı → kod varsayılanı (7 yıl).
 */
export function resolveAuditRetentionDays(
  action: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const family = familyFor(action);
  if (family) return AUDIT_RETENTION_FAMILY_DAYS[family];

  const fromEnv = parseRetentionDays(
    env[AUDIT_RETENTION_DEFAULT_DAYS_ENV],
    AUDIT_RETENTION_DEFAULT_DAYS_ENV,
  );
  return fromEnv ?? DEFAULT_AUDIT_RETENTION_DAYS;
}

/** Saklama süresinin dolduğu an (cutoff): kayıt bundan eskiyse kırpılabilir. */
export function auditRetentionCutoff(
  action: string,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Date {
  const days = resolveAuditRetentionDays(action, env);
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Kayıt, saklama süresi dolduğu için kırpılmaya uygun mu? */
export function isAuditRecordRetentionEligible(
  action: string,
  createdAt: Date,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return createdAt.getTime() < auditRetentionCutoff(action, now, env).getTime();
}
