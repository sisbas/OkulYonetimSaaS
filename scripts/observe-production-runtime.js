'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'wp07f-production-observation');
const observationPath = path.join(outDir, 'observation-identity.json');
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function cleanUrl(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text.startsWith('http://') || text.startsWith('https://') ? text.replace(/\/$/, '') : `https://${text.replace(/\/$/, '')}`;
}

function redactUrl(value) {
  try {
    const url = new URL(String(value));
    for (const key of Array.from(url.searchParams.keys())) {
      url.searchParams.set(key, '<redacted>');
    }
    return url.toString();
  } catch {
    return String(value ?? '');
  }
}

function redactPathname(value) {
  try {
    const url = new URL(String(value), 'https://observation.local');
    for (const key of Array.from(url.searchParams.keys())) {
      url.searchParams.set(key, '<redacted>');
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return String(value ?? '');
  }
}

function redact(value) {
  return String(value ?? '')
    .replace(/https?:\/\/[^\s,)"']+/g, (match) => redactUrl(match))
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(/x-vercel-protection-bypass[:=][^\s,}]+/gi, 'x-vercel-protection-bypass:<redacted>')
    .replace(/(token|secret|key|bypass)=([^&\s]+)/gi, '$1=<redacted>')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '<jwt-redacted>');
}

function observationRequestTimeoutMs(env = process.env) {
  const raw = env.OBSERVATION_REQUEST_TIMEOUT_MS;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.floor(parsed);
}

function requiredTargetBaseUrl(env = process.env) {
  const target = cleanUrl(env.OBSERVATION_TARGET_BASE_URL)
    || cleanUrl(env.PRODUCTION_DEPLOYMENT_URL)
    || cleanUrl(env.PRODUCTION_ALIAS)
    || cleanUrl(env.VERCEL_URL);
  if (!target) throw Object.assign(new Error('OBSERVATION_TARGET_BASE_URL or PRODUCTION_ALIAS or PRODUCTION_DEPLOYMENT_URL or VERCEL_URL is required'), { canonicalReason: 'MISSING_ENVIRONMENT' });
  return target;
}

function deploymentIdentity(env = process.env) {
  const productionDeploymentUrl = cleanUrl(env.PRODUCTION_DEPLOYMENT_URL) || cleanUrl(env.VERCEL_URL) || null;
  const productionDeploymentId = env.PRODUCTION_DEPLOYMENT_ID || env.VERCEL_DEPLOYMENT_ID || null;
  if (!productionDeploymentUrl && !productionDeploymentId) {
    throw Object.assign(new Error('Production deployment URL or deployment ID is required for reproducible observation identity'), { canonicalReason: 'MISSING_DEPLOYMENT_IDENTITY' });
  }
  return { productionDeploymentUrl, productionDeploymentId };
}

function expectedHeaders(headers, required) {
  const missing = [];
  for (const [key, expected] of Object.entries(required)) {
    const actual = headers.get(key.toLowerCase());
    if (!actual || (expected && actual !== expected)) missing.push({ key, expected, actual: actual || null });
  }
  return missing;
}

function expectedJsonValues(parsedJson, required = {}) {
  const mismatches = [];
  if (!required || Object.keys(required).length === 0) return mismatches;
  if (!parsedJson || typeof parsedJson !== 'object') {
    return Object.entries(required).map(([key, expected]) => ({ key, expected, actual: null }));
  }
  for (const [key, expected] of Object.entries(required)) {
    const actual = parsedJson[key];
    if (actual !== expected) mismatches.push({ key, expected, actual: actual ?? null });
  }
  return mismatches;
}

function safeJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function observationHeaders(env = process.env) {
  const headers = {};
  const bypassSecret = env.VERCEL_PROTECTION_BYPASS_SECRET || env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
    headers['x-vercel-set-bypass-cookie'] = 'true';
  }
  return headers;
}

function detectProtectedPreview(response, body, parsedJson, location) {
  const statusProtected = [302, 401, 403].includes(response.status);
  const markerText = `${location || ''}\n${body || ''}\n${JSON.stringify(parsedJson || {})}`.toLowerCase();
  const markerProtected = [
    'vercel authentication',
    'deployment protection',
    'password protection',
    'protection bypass',
    'sso',
    'login',
    'unauthorized',
    'forbidden',
  ].some((marker) => markerText.includes(marker));
  return statusProtected && markerProtected;
}

function classifyResponseFailure({ protectedPreview, vercelNotFound, jsonOk, jsonBodyOk, statusOk, headersOk, requireJson }) {
  if (protectedPreview) return 'PROTECTED_PREVIEW_BLOCKED';
  if (vercelNotFound || (requireJson && (!jsonOk || !jsonBodyOk))) return 'API_UNREACHABLE';
  if (!statusOk) return 'UNEXPECTED_STATUS';
  if (!headersOk) return 'HEADER_MISMATCH';
  return 'OBSERVATION_CHECK_FAILED';
}

async function requestCheck(baseUrl, name, pathname, options = {}) {
  const url = new URL(pathname, baseUrl).toString();
  const startedAt = new Date().toISOString();
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
    ? Math.floor(Number(options.timeoutMs))
    : observationRequestTimeoutMs(options.env);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: options.method || 'GET',
      redirect: 'manual',
      headers: { ...observationHeaders(options.env), ...(options.headers || {}) },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const location = response.headers.get('location') || '';
    const body = await response.text();
    const missingHeaders = expectedHeaders(response.headers, options.requiredHeaders || {});
    const parsedJson = contentType.includes('application/json') ? safeJson(body) : null;
    const jsonValueMismatches = expectedJsonValues(parsedJson, options.requiredJsonValues || {});
    const vercelNotFound = body.includes('The page could not be found')
      || body.includes('NOT_FOUND')
      || parsedJson?.code === 'NOT_FOUND'
      || parsedJson?.error?.code === 'NOT_FOUND';
    const protectedPreview = detectProtectedPreview(response, body, parsedJson, location);
    const statusOk = options.statuses ? options.statuses.includes(response.status) : response.status >= 200 && response.status < 500;
    const jsonOk = options.requireJson ? contentType.includes('application/json') && parsedJson !== null : true;
    const jsonBodyOk = jsonValueMismatches.length === 0;
    const notVercelOk = options.rejectVercelNotFound ? !vercelNotFound : true;
    const protectionOk = options.rejectProtectedPreview ? !protectedPreview : true;
    const headersOk = missingHeaders.length === 0;
    const ok = statusOk && jsonOk && jsonBodyOk && notVercelOk && protectionOk && headersOk;
    const failureReason = ok
      ? null
      : classifyResponseFailure({
        protectedPreview,
        vercelNotFound,
        jsonOk,
        jsonBodyOk,
        statusOk,
        headersOk,
        requireJson: Boolean(options.requireJson),
      });
    return {
      name,
      url: redactUrl(url),
      pathname: redactPathname(pathname),
      status: response.status,
      contentType,
      ok,
      failureReason,
      startedAt,
      finishedAt: new Date().toISOString(),
      timeoutMs,
      missingHeaders,
      jsonValueMismatches,
      vercelNotFound,
      protectedPreview,
      jsonBodyKeys: parsedJson && typeof parsedJson === 'object' ? Object.keys(parsedJson).sort() : [],
    };
  } catch (error) {
    const timeoutFailure = timedOut || error?.name === 'AbortError';
    return {
      name,
      url: redactUrl(url),
      pathname: redactPathname(pathname),
      ok: false,
      failureReason: timeoutFailure ? 'REQUEST_TIMEOUT' : 'API_UNREACHABLE',
      startedAt,
      finishedAt: new Date().toISOString(),
      timeoutMs,
      error: timeoutFailure ? `Request timed out after ${timeoutMs}ms` : redact(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function runtimeRequiredHeaders() {
  return {
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
}

async function buildObservationChecks(targetBaseUrl, options = {}) {
  const checks = [];
  const requestOptions = { fetchImpl: options.fetchImpl, env: options.env, timeoutMs: options.timeoutMs };

  if (options.selfTest) {
    checks.push(await requestCheck(targetBaseUrl, 'deliberate unreachable api self-test', '/__not-api-v1-unreachable-observation-probe__', {
      ...requestOptions,
      requireJson: true,
      rejectVercelNotFound: true,
      rejectProtectedPreview: true,
      statuses: [200, 400, 404, 422],
    }));
    return checks;
  }

  checks.push(await requestCheck(targetBaseUrl, 'runtime shell', '/runtime', { ...requestOptions, statuses: [200], requiredHeaders: runtimeRequiredHeaders() }));
  checks.push(await requestCheck(targetBaseUrl, 'runtime app asset', '/runtime/app.js', { ...requestOptions, statuses: [200], requiredHeaders: runtimeRequiredHeaders() }));
  checks.push(await requestCheck(targetBaseUrl, 'root hosted contract', '/', { ...requestOptions, statuses: [200, 307, 308] }));
  checks.push(await requestCheck(targetBaseUrl, 'legacy demo contract', '/demo', { ...requestOptions, statuses: [200, 307, 308] }));
  checks.push(await requestCheck(targetBaseUrl, 'full vision contract', '/full-vision', { ...requestOptions, statuses: [200, 307, 308] }));
  checks.push(await requestCheck(targetBaseUrl, 'known api application json', '/api/v1/health', {
    ...requestOptions,
    requireJson: true,
    requiredJsonValues: {
      status: 'ok',
      service: 'okul-yonetim-saas-api',
      applicationType: 'backend-api',
    },
    rejectVercelNotFound: true,
    rejectProtectedPreview: true,
    statuses: [200],
  }));

  return checks;
}

function buildReportDigest(report) {
  return digest(JSON.stringify({ ...report, artifactDigest: null }, null, 2));
}

function writeReport(report) {
  fs.mkdirSync(outDir, { recursive: true });
  report.artifactDigest = buildReportDigest(report);
  fs.writeFileSync(observationPath, JSON.stringify(report, null, 2));
}

async function buildObservationReport(env = process.env, fetchImpl = fetch) {
  const targetBaseUrl = requiredTargetBaseUrl(env);
  const { productionDeploymentUrl, productionDeploymentId } = deploymentIdentity(env);
  const commitSha = env.PULL_REQUEST_HEAD_SHA || env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA || 'unknown';
  const expectedHeadSha = env.EXPECTED_PR_HEAD_SHA || '';
  const branchRef = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || env.VERCEL_GIT_COMMIT_REF || 'unknown';
  const productionAlias = cleanUrl(env.PRODUCTION_ALIAS) || targetBaseUrl;
  const artifactName = `wp07f-production-observation-${commitSha}`;
  const selfTest = env.OBSERVATION_SELF_TEST_UNREACHABLE_API === 'true';

  const checks = await buildObservationChecks(targetBaseUrl, {
    selfTest,
    fetchImpl,
    env,
    timeoutMs: observationRequestTimeoutMs(env),
  });

  const identityChecks = [];
  if (expectedHeadSha && commitSha !== expectedHeadSha) {
    identityChecks.push({ ok: false, failureReason: 'STALE_ARTIFACT_HEAD_MISMATCH', expectedHeadSha, commitSha });
  }

  const failureReasons = [
    ...identityChecks.filter((check) => !check.ok).map((check) => check.failureReason),
    ...checks.filter((check) => !check.ok).map((check) => check.failureReason || 'OBSERVATION_CHECK_FAILED'),
  ];

  const apiReachability = checks.find((check) => check.name === 'known api application json');
  const overallStatus = failureReasons.length === 0 ? 'PASS' : 'FAIL';
  return {
    overallStatus,
    issue: 185,
    purpose: 'WP-07F production runtime and same-origin /api/v1 observation',
    commitSha,
    expectedHeadSha: expectedHeadSha || null,
    branchRef,
    productionDeploymentId,
    productionDeploymentUrl: productionDeploymentUrl ? redactUrl(productionDeploymentUrl) : null,
    productionAlias: redactUrl(productionAlias),
    targetBaseUrl: redactUrl(targetBaseUrl),
    observationTimestamp: new Date().toISOString(),
    artifactName,
    artifactDigest: null,
    failureReasons,
    apiReachabilityStatus: apiReachability?.ok ? 'PASS' : 'FAIL',
    checks,
    identityChecks,
  };
}

async function main() {
  const report = await buildObservationReport(process.env, fetch);
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  if (report.overallStatus !== 'PASS') process.exitCode = 1;
}

function writeFailureReport(error) {
  const failureReason = error && error.canonicalReason ? error.canonicalReason : 'SCRIPT_EXCEPTION';
  const report = {
    overallStatus: 'FAIL',
    issue: 185,
    purpose: 'WP-07F production runtime and same-origin /api/v1 observation',
    observationTimestamp: new Date().toISOString(),
    failureReasons: [failureReason],
    error: redact(error instanceof Error ? error.message : String(error)),
  };
  try {
    writeReport(report);
  } catch (writeError) {
    console.error(JSON.stringify({
      overallStatus: 'FAIL',
      issue: 185,
      observationTimestamp: new Date().toISOString(),
      failureReasons: ['ARTIFACT_WRITE_FAILURE'],
      error: redact(writeError instanceof Error ? writeError.message : String(writeError)),
    }, null, 2));
  }
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch(writeFailureReport);
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  buildObservationChecks,
  buildObservationReport,
  cleanUrl,
  observationRequestTimeoutMs,
  redact,
  redactPathname,
  redactUrl,
  requestCheck,
};
