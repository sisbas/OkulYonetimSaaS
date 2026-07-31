'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'wp07f-production-observation');
const observationPath = path.join(outDir, 'observation-identity.json');
const timestamp = new Date().toISOString();

function cleanUrl(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text.startsWith('http://') || text.startsWith('https://') ? text.replace(/\/$/, '') : `https://${text.replace(/\/$/, '')}`;
}

function redact(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(/x-vercel-protection-bypass[:=][^\s,}]+/gi, 'x-vercel-protection-bypass:<redacted>')
    .replace(/(token|secret|key|bypass)=([^&\s]+)/gi, '$1=<redacted>')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '<jwt-redacted>');
}

function requiredTargetBaseUrl() {
  const target = cleanUrl(process.env.OBSERVATION_TARGET_BASE_URL)
    || cleanUrl(process.env.PRODUCTION_DEPLOYMENT_URL)
    || cleanUrl(process.env.PRODUCTION_ALIAS)
    || cleanUrl(process.env.VERCEL_URL);
  if (!target) throw Object.assign(new Error('OBSERVATION_TARGET_BASE_URL or PRODUCTION_ALIAS or PRODUCTION_DEPLOYMENT_URL or VERCEL_URL is required'), { canonicalReason: 'MISSING_ENVIRONMENT' });
  return target;
}

function deploymentIdentity() {
  const productionDeploymentUrl = cleanUrl(process.env.PRODUCTION_DEPLOYMENT_URL) || cleanUrl(process.env.VERCEL_URL) || null;
  const productionDeploymentId = process.env.PRODUCTION_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || null;
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

function observationHeaders() {
  const headers = {};
  const bypassSecret = process.env.VERCEL_PROTECTION_BYPASS_SECRET || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
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

async function requestCheck(baseUrl, name, pathname, options = {}) {
  const url = new URL(pathname, baseUrl).toString();
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      redirect: 'manual',
      headers: { ...observationHeaders(), ...(options.headers || {}) },
    });
    const contentType = response.headers.get('content-type') || '';
    const location = response.headers.get('location') || '';
    const body = await response.text();
    const missingHeaders = expectedHeaders(response.headers, options.requiredHeaders || {});
    const parsedJson = contentType.includes('application/json') ? safeJson(body) : null;
    const vercelNotFound = body.includes('The page could not be found')
      || body.includes('NOT_FOUND')
      || parsedJson?.code === 'NOT_FOUND'
      || parsedJson?.error?.code === 'NOT_FOUND';
    const protectedPreview = detectProtectedPreview(response, body, parsedJson, location);
    const statusOk = options.statuses ? options.statuses.includes(response.status) : response.status >= 200 && response.status < 500;
    const jsonOk = options.requireJson ? contentType.includes('application/json') && parsedJson !== null : true;
    const notVercelOk = options.rejectVercelNotFound ? !vercelNotFound : true;
    const protectionOk = options.rejectProtectedPreview ? !protectedPreview : true;
    const headersOk = missingHeaders.length === 0;
    const ok = statusOk && jsonOk && notVercelOk && protectionOk && headersOk;
    const failureReason = ok
      ? null
      : (options.canonicalFailureReason
        || (protectedPreview ? 'PROTECTED_PREVIEW_BLOCKED'
          : (vercelNotFound || !jsonOk ? 'API_UNREACHABLE' : 'OBSERVATION_CHECK_FAILED')));
    return {
      name,
      url: redact(url),
      pathname,
      status: response.status,
      contentType,
      ok,
      failureReason,
      startedAt,
      finishedAt: new Date().toISOString(),
      missingHeaders,
      vercelNotFound,
      protectedPreview,
      jsonBodyKeys: parsedJson && typeof parsedJson === 'object' ? Object.keys(parsedJson).sort() : [],
    };
  } catch (error) {
    return {
      name,
      url: redact(url),
      pathname,
      ok: false,
      failureReason: options.canonicalFailureReason || 'API_UNREACHABLE',
      startedAt,
      finishedAt: new Date().toISOString(),
      error: redact(error instanceof Error ? error.message : String(error)),
    };
  }
}

function buildReportDigest(report) {
  return digest(JSON.stringify({ ...report, artifactDigest: null }, null, 2));
}

function writeReport(report) {
  fs.mkdirSync(outDir, { recursive: true });
  report.artifactDigest = buildReportDigest(report);
  fs.writeFileSync(observationPath, JSON.stringify(report, null, 2));
}

async function main() {
  const targetBaseUrl = requiredTargetBaseUrl();
  const { productionDeploymentUrl, productionDeploymentId } = deploymentIdentity();
  const commitSha = process.env.PULL_REQUEST_HEAD_SHA || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
  const expectedHeadSha = process.env.EXPECTED_PR_HEAD_SHA || '';
  const branchRef = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || process.env.VERCEL_GIT_COMMIT_REF || 'unknown';
  const productionAlias = cleanUrl(process.env.PRODUCTION_ALIAS) || targetBaseUrl;
  const artifactName = `wp07f-production-observation-${commitSha}`;

  const runtimeRequiredHeaders = {
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };

  const checks = [];
  checks.push(await requestCheck(targetBaseUrl, 'runtime shell', '/runtime', { statuses: [200], requiredHeaders: runtimeRequiredHeaders }));
  checks.push(await requestCheck(targetBaseUrl, 'runtime app asset', '/runtime/app.js', { statuses: [200], requiredHeaders: runtimeRequiredHeaders }));
  checks.push(await requestCheck(targetBaseUrl, 'root hosted contract', '/', { statuses: [200, 307, 308] }));
  checks.push(await requestCheck(targetBaseUrl, 'legacy demo contract', '/demo', { statuses: [200, 307, 308] }));
  checks.push(await requestCheck(targetBaseUrl, 'full vision contract', '/full-vision', { statuses: [200, 307, 308] }));
  checks.push(await requestCheck(targetBaseUrl, 'known api application json', '/api/v1/daily-operations/today?branchId=00000000-0000-4000-8000-000000000185', {
    requireJson: true,
    rejectVercelNotFound: true,
    rejectProtectedPreview: true,
    statuses: [200, 400, 404, 422],
  }));

  if (process.env.OBSERVATION_SELF_TEST_UNREACHABLE_API === 'true') {
    checks.push(await requestCheck(targetBaseUrl, 'deliberate unreachable api self-test', '/__not-api-v1-unreachable-observation-probe__', {
      requireJson: true,
      rejectVercelNotFound: true,
      rejectProtectedPreview: true,
      statuses: [200, 400, 404, 422],
      canonicalFailureReason: 'API_UNREACHABLE',
    }));
  }

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
  const report = {
    overallStatus,
    issue: 185,
    purpose: 'WP-07F production runtime and same-origin /api/v1 observation',
    commitSha,
    expectedHeadSha: expectedHeadSha || null,
    branchRef,
    productionDeploymentId,
    productionDeploymentUrl,
    productionAlias,
    targetBaseUrl: redact(targetBaseUrl),
    observationTimestamp: timestamp,
    artifactName,
    artifactDigest: null,
    failureReasons,
    apiReachabilityStatus: apiReachability?.ok ? 'PASS' : 'FAIL',
    checks,
    identityChecks,
  };
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  if (overallStatus !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  const failureReason = error && error.canonicalReason ? error.canonicalReason : 'SCRIPT_EXCEPTION';
  const report = {
    overallStatus: 'FAIL',
    issue: 185,
    purpose: 'WP-07F production runtime and same-origin /api/v1 observation',
    observationTimestamp: timestamp,
    failureReasons: [failureReason],
    error: redact(error instanceof Error ? error.message : String(error)),
  };
  try {
    writeReport(report);
  } catch (writeError) {
    console.error(JSON.stringify({
      overallStatus: 'FAIL',
      issue: 185,
      observationTimestamp: timestamp,
      failureReasons: ['ARTIFACT_WRITE_FAILURE'],
      error: redact(writeError instanceof Error ? writeError.message : String(writeError)),
    }, null, 2));
  }
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
