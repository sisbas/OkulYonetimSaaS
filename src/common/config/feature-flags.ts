/**
 * #482 — Deploy seviyesinde yetenek anahtarları.
 *
 * Kural (ADR 0003 D2): açma/kapama tek anahtardır, tenant bazlı ayar yoktur
 * ve varsayılan **kapalı**dır. Yalnız literal `'true'` açar; tanımsız, boş,
 * `'false'`, `'1'`, `'TRUE'` gibi değerler kapalı sayılır. Böylece yanlış
 * yazılmış bir deploy değişkeni ekranı sessizce açmaz (fail-closed).
 */
export const STRATEGIC_GOALS_ENABLED_ENV = 'STRATEGIC_GOALS_ENABLED';

/** `/context` capability anahtarı (ADR 0003 D3). İzin kodu değildir. */
export const STRATEGIC_GOALS_CAPABILITY = 'strategic_goals';

/** Stratejik hedefler yüzeyi bu ortamda açık mı? (varsayılan: hayır) */
export function isStrategicGoalsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[STRATEGIC_GOALS_ENABLED_ENV] === 'true';
}

/**
 * `/context` yanıtının `capabilities` alanı.
 *
 * Capability, yetki kararı değildir: zorlama sunucudaki `@Permissions`
 * guard'ında kalır (#339/#445, K-43/K-44/K-45). Bu alan YALNIZ hangi ürün
 * yüzeyinin bu deploy'da var olduğunu söyler; izin anahtarı yayımlamaz.
 */
export function contextCapabilities(env: NodeJS.ProcessEnv = process.env): string[] {
  return isStrategicGoalsEnabled(env) ? [STRATEGIC_GOALS_CAPABILITY] : [];
}
