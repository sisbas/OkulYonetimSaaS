'use strict';

/**
 * S5-B2 (#269 AC-7) - post-merge reversible synthetic canary.
 *
 * Sözleşme:
 * - Yalnızca sentetik, ayrıcalıklı olmayan bir operatör hesabı kullanır.
 * - Hiçbir iş sonucu (izin, program, yoklama, bildirim) YAZMAZ. Bu yüzden
 *   geri alınacak bir mutasyon yoktur; rollback kanıtı "zero mutations"dır.
 * - Aynı origin `/api/v1` üzerinden health + login + yetkili okuma yapar.
 * - 5 health örneğinden p95 gecikme ve hata oranını hesaplar; SLO aşılırsa
 *   EXIT=1. Erişilemeyen/401/403/5xx ortam PASS değildir.
 * - Rapor PII/secret taşımaz: e-posta, token, telefon ve URL query değerleri
 *   yazılmaz. Artefakt: artifacts/post-merge-canary/canary.json
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SLO_P95_MS = 1_500;
const REQUEST_TIMEOUT_MS = 10_000;
const SAMPLES = 5;

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw Object.assign(new Error(`${name} is required for the post-merge synthetic canary.`), {
      canonicalReason: 'MISSING_ENVIRONMENT',
    });
  }
  return value.trim();
}

function optional(name) {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0 ? null : value.trim();
}

function baseUrl() {
  const raw = optional('CANARY_BASE_URL') ?? optional('APP_BASE_URL');
  if (raw === null) {
    throw Object.assign(new Error('CANARY_BASE_URL or APP_BASE_URL is required.'), {
      canonicalReason: 'MISSING_ENVIRONMENT',
    });
  }
  const cleaned = raw.replace(/\/$/, '');
  if (!/^https?:\/\//.test(cleaned)) {
    throw Object.assign(new Error('Canary base URL must be absolute http(s).'), {
      canonicalReason: 'INVALID_TARGET',
    });
  }
  return cleaned;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function scrub(value) {
  return String(value ?? '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer <redacted>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email-redacted>')
    .replace(/(?:password|token|secret)=([^&\s]+)/gi, '$1=<redacted>');
}

async function timedFetch(url, options) {
  const started = process.hrtime.bigint();
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    keepalive: false,
  });
  const text = await response.text();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { status: response.status, text, ms: Math.round(ms * 100) / 100 };
}

async function main() {
  const target = baseUrl();
  const email = required('CANARY_EMAIL');
  const password = required('CANARY_PASSWORD');
  const branchCode = optional('CANARY_BRANCH_CODE');
  const tenantId = optional('CANARY_TENANT_ID');
  const sloP95 = Number(optional('CANARY_SLO_P95_MS') ?? DEFAULT_SLO_P95_MS);
  const head = process.env.GITHUB_SHA ?? optional('CANARY_EXPECTED_HEAD') ?? 'unknown';
  const startedAt = new Date().toISOString();
  const checks = [];
  const healthSamples = [];

  const record = (name, ok, detail, ms) => {
    checks.push({ name, ok, status: detail, ms });
    if (!ok) throw new Error(`${name} failed: ${detail}`);
  };

  try {
    for (let i = 0; i < SAMPLES; i += 1) {
      const sample = await timedFetch(`${target}/api/v1/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      healthSamples.push(sample.ms);
      if (sample.status !== 200) {
        record('health', false, `HTTP ${sample.status}`, sample.ms);
      }
    }
    const healthP95 = p95(healthSamples);
    checks.push({
      name: 'health.slo',
      ok: healthP95 <= sloP95,
      status: `p95=${healthP95}ms threshold=${sloP95}ms samples=${healthSamples.join(',')}`,
      ms: healthP95,
    });
    if (healthP95 > sloP95) {
      throw new Error(`health p95 ${healthP95}ms exceeded SLO ${sloP95}ms.`);
    }

    const login = await timedFetch(`${target}/api/v1/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...(tenantId === null ? {} : { tenantId }) }),
    });
    record('auth.login', login.status === 200, `HTTP ${login.status}`, login.ms);
    const loginBody = JSON.parse(login.text);
    const token = loginBody.accessToken;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('auth.login response did not include accessToken.');
    }
    checks.push({ name: 'auth.token', ok: true, status: 'accessToken issued', ms: 0 });

    const authHeaders = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(branchCode === null ? {} : { 'x-branch-code': branchCode }),
    };

    const queueUrl = new URL(`${target}/api/v1/daily-operations/today`);
    if (branchCode !== null) queueUrl.searchParams.set('branchId', branchCode);
    queueUrl.searchParams.set('date', todayIso());
    const queue = await timedFetch(queueUrl.toString(), { method: 'GET', headers: authHeaders });
    record('daily-operations.today', queue.status === 200, `HTTP ${queue.status}`, queue.ms);

    const notifications = await timedFetch(
      `${target}/api/v1/notifications?limit=1&offset=0`,
      { method: 'GET', headers: authHeaders },
    );
    record('notifications.read', notifications.status === 200, `HTTP ${notifications.status}`, notifications.ms);

    const report = {
      canary: 'post-merge-reversible-read-only',
      head,
      targetHost: new URL(target).host,
      startedAt,
      finishedAt: new Date().toISOString(),
      verdict: 'PASS',
      reversible: {
        mutations: 0,
        jobOutcomeRowsCreated: 0,
        rollback: 'No business state written; the synthetic session token is discarded in-process.',
        rollbackEvidence: 'mutations=0 (read-only canary)',
      },
      slo: {
        healthSamplesMs: healthSamples,
        healthP95Ms: healthP95,
        thresholdMs: sloP95,
        errorRate: 0,
      },
      checks,
      redaction: 'No email/token/phone/query secret is written to this report.',
    };
    writeReport(report);
    console.log(`canary PASS head=${head} p95=${healthP95}ms`);
  } catch (error) {
    const report = {
      canary: 'post-merge-reversible-read-only',
      head,
      targetHost: (() => {
        try {
          return new URL(target).host;
        } catch {
          return 'invalid';
        }
      })(),
      startedAt,
      finishedAt: new Date().toISOString(),
      verdict: 'FAIL',
      reason: scrub(error instanceof Error ? error.message : String(error)),
      canonicalReason: error.canonicalReason ?? 'CANARY_FAILED',
      reversible: {
        mutations: 0,
        jobOutcomeRowsCreated: 0,
        rollback: 'No business state written before failure; token discarded.',
      },
      checks,
    };
    writeReport(report);
    console.error(`canary FAIL: ${report.reason}`);
    process.exitCode = 1;
  }
}

function writeReport(report) {
  const outputDir = path.join(process.cwd(), 'artifacts', 'post-merge-canary');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'canary.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(scrub(error instanceof Error ? error.stack ?? error.message : String(error)));
    process.exit(1);
  });
}

module.exports = { p95, scrub };
