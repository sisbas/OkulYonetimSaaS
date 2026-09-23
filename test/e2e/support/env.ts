import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * S0-A1 (#269 AC-1 / AC-2) — fail-closed E2E ortam sözleşmesi.
 *
 * Amaç: E2E harness'ının eksik/yanlış yapılandırmayla sessizce "yeşil"
 * görünmesini engellemek. Zorunlu bir değişken yoksa test burada, açık ve tek
 * anlamlı bir hata ile durur; `skip` / `neutral` / `env unreachable` PASS
 * değildir (Faz 1b kabul kuralı).
 */

export class E2eEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E2eEnvironmentError';
  }
}

export type E2eEnvironment = Readonly<{
  /** Canlı Nest backend kökü; aynı origin `/api/v1` ve `/runtime/` yüzeyi. */
  baseUrl: string;
  /** Gerçek PostgreSQL bağlantısı (fresh DB). */
  databaseUrl: string;
  /** Kanıtın bağlanacağı exact commit. */
  headSha: string;
  /** Artefakt (screenshot/report/log) dizini. */
  artifactDir: string;
  /** Journey/negatif matris iskeletinin kendi artefakt dizini. */
  journeyArtifactDir: string;
  /** Tarayıcı çalıştırma stratejisi; yalnız 'sparticuz' kabul edilir. */
  browserStrategy: string;
  /** Backend'in dinleyeceği port. */
  port: number;
  /** İzin seed'inin oluşturduğu kurum slug'ı (roller burada yaşar). */
  seedTenantSlug: string;
  /** Referans kullanıcılar için sentetik oturum parolası. */
  fixtureCredential: string;
}>;

const REQUIRED_BROWSER_STRATEGY = 'sparticuz';

export const E2E_ARTIFACT_DIR = path.join(process.cwd(), 'artifacts', 'wp07f-p0-browser-e2e');

/**
 * Journey iskeletinin artefakt kökü. Shell-auth spec'i ile aynı dizine
 * yazmak iki koşunun manifestolarını/raporlarını birbirine karıştırırdı;
 * her yüzey kendi dizininde kendi manifestosunu üretir.
 */
export const JOURNEY_ARTIFACT_DIR = path.join(E2E_ARTIFACT_DIR, 'journey');

/** Shell-auth manifestosu journey alt ağacını kapsamaz. */
export const JOURNEY_ARTIFACT_PREFIX = 'journey';

/**
 * İkinci bir kabul yüzeyi (`journey`) aynı portu kullanamaz: `startRuntimeServer`
 * port sahipliğini kanıtlar ve başka bir süreç portu tutuyorsa reddeder. İki
 * spec çakışmasın diye journey kendi portunu (PORT + offset) ve kendi
 * baseUrl'ini kullanır. Uzak bir `APP_BASE_URL` verilmişse port sahipliği zaten
 * harness'ta değildir; o durumda yapılandırılmış yüzey korunur.
 */
export function resolveSecondaryRuntimeTarget(
  environment: E2eEnvironment,
  offset = 1,
): Readonly<{ baseUrl: string; port: number }> {
  const parsed = new URL(environment.baseUrl);
  const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (!isLocal) {
    const port = parsed.port.length > 0 ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    return Object.freeze({ baseUrl: environment.baseUrl, port });
  }
  const port = environment.port + offset;
  return Object.freeze({ baseUrl: `http://127.0.0.1:${port}`, port });
}

function requireValue(name: string, hint: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    throw new E2eEnvironmentError(`${name} is required for the acceptance E2E harness (${hint}).`);
  }
  return raw.trim();
}

function resolvePort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw.trim().length === 0) return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new E2eEnvironmentError(`PORT must be a valid TCP port number (received: ${raw}).`);
  }
  return port;
}

/**
 * Exact head binding: CI'da workflow tarafından verilir. Yerel çalıştırmada
 * git'ten okunur. Hiçbiri yoksa kanıt sahte bir 'unknown' SHA'ya bağlanmasın
 * diye hata verilir.
 */
function resolveHeadSha(): string {
  const fromEnv =
    process.env.PULL_REQUEST_HEAD_SHA ?? process.env.GITHUB_HEAD_SHA ?? process.env.GITHUB_SHA;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim();

  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (sha.length > 0) return sha;
  } catch {
    // Aşağıdaki fail-closed hataya düşer.
  }
  throw new E2eEnvironmentError(
    'Exact head SHA is required for acceptance evidence: set PULL_REQUEST_HEAD_SHA or run inside a git checkout.',
  );
}

/**
 * Referans kullanıcıların sentetik oturum parolası.
 *
 * Yalnız env'den gelir; yoksa çalışma zamanında rastgele türetilir. Depoda
 * gömülü, gerçek görünümlü bir credential literalı YOKTUR (kural 18).
 */
function resolveFixtureCredential(): string {
  const fromEnv = process.env.E2E_SYNTHETIC_CREDENTIAL;
  if (fromEnv !== undefined && fromEnv.trim().length >= 8) return fromEnv.trim();

  const entropy = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return ['s0a1', 'runtime', entropy].join('-');
}

/**
 * JWT secret'ları production'daki fail-closed bootstrap ile aynı sözleşmeye
 * tabidir. Test ortamında değerler workflow'dan gelir; eksikse harness
 * başlamadan durur (yanlış yapılandırmayı "yeşil" saymamak için).
 */
export function assertJwtSecretsConfigured(): void {
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[name];
    if (value === undefined || value.length < 32) {
      throw new E2eEnvironmentError(
        `${name} must be present with at least 32 characters for the acceptance E2E backend.`,
      );
    }
  }
}

export function assertBrowserStrategySupported(): void {
  const strategy = process.env.PUPPETEER_EXECUTABLE_STRATEGY ?? REQUIRED_BROWSER_STRATEGY;
  if (strategy !== REQUIRED_BROWSER_STRATEGY) {
    throw new E2eEnvironmentError(
      `PUPPETEER_EXECUTABLE_STRATEGY must be '${REQUIRED_BROWSER_STRATEGY}' for reproducible acceptance evidence (received: ${strategy}).`,
    );
  }
}

export function readE2eEnvironment(): E2eEnvironment {
  const port = resolvePort();
  const databaseUrl = requireValue(
    'DATABASE_URL',
    'a real PostgreSQL database is mandatory for fresh-DB acceptance evidence',
  );

  assertJwtSecretsConfigured();
  assertBrowserStrategySupported();

  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
  const baseUrl =
    configuredBaseUrl !== undefined && configuredBaseUrl.length > 0
      ? configuredBaseUrl.replace(/\/$/, '')
      : `http://127.0.0.1:${port}`;

  return Object.freeze({
    baseUrl,
    databaseUrl,
    headSha: resolveHeadSha(),
    artifactDir: E2E_ARTIFACT_DIR,
    journeyArtifactDir: JOURNEY_ARTIFACT_DIR,
    browserStrategy: REQUIRED_BROWSER_STRATEGY,
    port,
    seedTenantSlug: process.env.SEED_TENANT_SLUG?.trim() || 'system-seed',
    fixtureCredential: resolveFixtureCredential(),
  });
}
