import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Yalnızca yaşam döngüsü yönetimi için gereken yapısal süreç arayüzü.
 * `spawn(..., { stdio: ['ignore','pipe','pipe'] })` sonucu bu sözleşmeyi
 * karşılar; tam ChildProcess varyantına bağlanmak yerine dar tutulur.
 */
type ManagedChild = {
  pid?: number;
  killed: boolean;
  exitCode: number | null;
  kill: (signal?: NodeJS.Signals) => boolean;
  once: (event: 'exit', listener: () => void) => unknown;
};

/**
 * S0-A1 (#269 AC-2) — gerçek Nest backend'i süreç olarak başlatır.
 *
 * Gerekçe: kabul kanıtı, uygulamanın üretimdeki giriş noktası (`src/main.ts`)
 * üzerinden, gerçek PostgreSQL ile çalışmalıdır. Test içinde Nest'i yeniden
 * kurmak (in-process) bootstrap farklarını gizleyebilir.
 *
 * Hazır olma ölçütü yalnız `/api/v1/health` 200 + `status: 'ok'` olmasıdır;
 * "bir süre bekledim" yaklaşımı kabul edilmez (env unreachable = PASS değil).
 */

export type RuntimeServer = Readonly<{
  logPath: string;
  pid: number;
  stop: () => Promise<void>;
}>;

export type StartRuntimeServerInput = Readonly<{
  baseUrl: string;
  port: number;
  artifactDir: string;
  readyTimeoutMs?: number;
}>;

const DEFAULT_READY_TIMEOUT_MS = 180_000;
const READY_POLL_INTERVAL_MS = 500;
const STOP_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTsNodeBin(repoRoot: string): string {
  const bin = path.join(repoRoot, 'node_modules', 'ts-node', 'dist', 'bin.js');
  if (!fs.existsSync(bin)) {
    throw new Error(
      `ts-node CLI is missing at ${bin}. Run "npm ci" before the acceptance harness.`,
    );
  }
  return bin;
}

async function healthIsReady(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return (body as { status?: string } | null)?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Süreç ağacını kapatır. Windows'ta `taskkill /T /F` olmadan ts-node alt
 * süreçleri ayakta kalıp port'u tutabiliyor.
 */
async function stopProcessTree(child: ManagedChild): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

  if (process.platform === 'win32' && child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }

  const timeout = sleep(STOP_TIMEOUT_MS).then(() => 'timeout' as const);
  const result = await Promise.race([exited.then(() => 'exited' as const), timeout]);
  if (result === 'timeout') {
    child.kill('SIGKILL');
    await exited;
  }
}

export async function startRuntimeServer(input: StartRuntimeServerInput): Promise<RuntimeServer> {
  const repoRoot = process.cwd();
  const tsNodeBin = resolveTsNodeBin(repoRoot);
  const readyTimeoutMs = input.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;

  fs.mkdirSync(input.artifactDir, { recursive: true });
  const logPath = path.join(input.artifactDir, 'backend.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const child = spawn(process.execPath, [tsNodeBin, 'src/main.ts'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(input.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  let exitedEarly = false;
  child.once('exit', () => {
    exitedEarly = true;
  });

  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    if (exitedEarly) {
      logStream.end();
      throw new Error(
        `Nest backend exited before /api/v1/health became ready. Inspect ${logPath}.`,
      );
    }
    if (await healthIsReady(input.baseUrl)) {
      return Object.freeze({
        logPath,
        pid: child.pid ?? -1,
        stop: async () => {
          await stopProcessTree(child);
          logStream.end();
        },
      });
    }
    await sleep(READY_POLL_INTERVAL_MS);
  }

  await stopProcessTree(child);
  logStream.end();
  throw new Error(
    `Nest backend did not expose /api/v1/health within ${readyTimeoutMs}ms. Inspect ${logPath}.`,
  );
}
