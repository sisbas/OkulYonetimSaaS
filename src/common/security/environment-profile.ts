/**
 * Runtime ortam profili (#259 P1B-02 AC-2).
 *
 * "Local/test fallback explicit, isolated and impossible in production" kuralı
 * TEK bir yerden yönetilir. Bütün gizli anahtar çözücüleri (JWT, audit HMAC,
 * KVKK pseudonym, parent-contact crypto) bu modülden geçer.
 *
 * Sözleşme:
 * - `production` / `prod`  → production profili. Fallback anahtar YOK; eksik ya
 *   da zayıf env süreç başlamadan FATAL verir.
 * - `development` / `dev` / `test` / `local` → local profili. Fallback anahtar
 *   AÇIKÇA beyan edilmiş bu profilde kullanılabilir.
 * - NODE_ENV hiç verilmemiş ya da tanınmayan bir değer → **fail-closed**.
 *
 * Neden: konteyner/PaaS dağıtımlarında `NODE_ENV` sık sık set edilmez. Eski
 * davranış `(NODE_ENV ?? '') === 'production'` idi; bu durumda set edilmemiş
 * NODE_ENV sessizce "production değil" sayılıyor ve tahmin edilebilir local
 * fallback anahtarları gerçek bir dağıtımda kullanılabiliyordu. Artık böyle bir
 * ortam "belirsiz" kabul edilir ve fallback reddedilir.
 */

export const PRODUCTION_ENVIRONMENT_NAMES = ['production', 'prod'] as const;
export const LOCAL_ENVIRONMENT_NAMES = ['development', 'dev', 'test', 'local'] as const;

export type RuntimeProfile = 'production' | 'local';

const PRODUCTION_NAMES = new Set<string>(PRODUCTION_ENVIRONMENT_NAMES);
const LOCAL_NAMES = new Set<string>(LOCAL_ENVIRONMENT_NAMES);

/** Test ve hata mesajlarında kullanılan ortak değer listesi. */
export const KNOWN_ENVIRONMENT_NAMES = [
  ...PRODUCTION_ENVIRONMENT_NAMES,
  ...LOCAL_ENVIRONMENT_NAMES,
] as const;

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * NODE_ENV'i açık bir profile çözer.
 *
 * `purpose` yalnız hata mesajını anlaşılır kılmak için kullanılır (hangi anahtar
 * ailesinin çözülemediğini söyler). Gizli değer ASLA mesaja yazılmaz.
 */
export function resolveRuntimeProfile(
  env: NodeJS.ProcessEnv = process.env,
  purpose = 'a local-fallback security secret',
): RuntimeProfile {
  const raw = normalize(env.NODE_ENV);
  if (PRODUCTION_NAMES.has(raw)) return 'production';
  if (LOCAL_NAMES.has(raw)) return 'local';
  throw new Error(
    `FATAL: NODE_ENV must be explicitly set to one of ${KNOWN_ENVIRONMENT_NAMES.join('|')} ` +
      `before ${purpose} can be resolved (received ${raw === '' ? '<unset>' : `'${raw}'`}). ` +
      `An unset or unknown NODE_ENV is never treated as local: the local fallback must be explicit.`,
  );
}

/** Production profilinde miyiz? Belirsiz NODE_ENV fail-closed davranır (fırlatır). */
export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveRuntimeProfile(env) === 'production';
}

/** Fail-closed hata mesajı: fallback anahtarı yalnız açık local profilde kullanılabilir. */
export function missingSecretMessage(envName: string): string {
  return `FATAL: ${envName} is required in production but missing from environment.`;
}
