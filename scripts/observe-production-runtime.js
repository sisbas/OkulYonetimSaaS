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

function requiredTargetBaseUrl() {
  const target = cleanUrl(process.env.OBSERVATION_TARGET_BASE_URL)
    || cleanUrl(process.env.PRODUCTION_DEPLOYMENT_URL)
    || cleanUrl(process.env.PRODUCTION_ALIAS)
    || cleanUrl(process.env.VERCEL_URL);
  if (!target) throw new Error('OBSERVATION_TARGET_BASE_URL or PRODUCTION_ALIAS or PRODUCTION_DEPLOYMENT_URL or VERCEL_URL is required');
  return target;
}

function expectedHeaders(headers, required) {
  const missing = [];
  for (const [key, expected] of Object.entries(required)) {
    const actual = headers.get(key.toLowerCase());
    if (!actual || (expected && actual !== expected)) missing.push({ key, expected, actual: actual || null });
  }
  return missing;
}

async function requestCheck(baseUrl, name, pathname, options = {}) {
  const url = new URL(pathname, baseUrl).toString();
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { method: options.method || 'GET', headers: options.headers || {} });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    const missingHeaders = expectedHeaders(response.headers, options.requiredHeaders || {});
    const parsedJson = contentType.includes('application/json') ? safeJson(body) : null;
    const vercelNotFound = body.includes('The page could not be found')
      || body.includes('NOT_FOUND')
      || parsedJson?.code === 'NOT_FOUND'
      || parsedJson?.error?.code === 'NOT_FOUND';
    const statusOk = options.statuses ? options.statuses.includes(response.status) : response.status >= 200 && response.status < 500;
    const jsonOk = options.requireJson ? contentType.includes('application/json') && parsedJson !== null : true;
    const notVercelOk = options.rejectVercelNotFound ? !vercelNotFound : true;
    const headersOk = missingHeaders.length === 0;
    const ok = statusOk && jsonOk && notVercelOk && headersOk;
    return {
      name,
      url,
      pathname,
      status: response.status,
      contentType,
      ok,
      startedAt,
      finishedAt: new Date().toISOString(),
      missingHeaders,
      vercelNotFound,
      jsonBodyKeys: parsedJson && typeof parsedJson === 'object' ? Object.keys(parsedJson).sort() : [],
    };
  } catch (error) {
    return {
      name,
      url,
      pathname,
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

async function main() {
  const targetBaseUrl = requiredTargetBaseUrl();
  const commitSha = process.env.PULL_REQUEST_HEAD_SHA || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
  const branchRef = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || process.env.VERCEL_GIT_COMMIT_REF || 'unknown';
  const productionAlias = cleanUrl(process.env.PRODUCTION_ALIAS) || targetBaseUrl;
  const productionDeploymentUrl = cleanUrl(process.env.PRODUCTION_DEPLOYMENT_URL) || cleanUrl(process.env.VERCEL_URL) || null;
  const productionDeploymentId = process.env.PRODUCTION_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || null;
  const artifactName = `wp07f-production-observation-${commitSha}`;
  fs.mkdirSync(outDir, { recursive: true });

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
    statuses: [200, 400, 401, 403, 404, 422],
  }));

  if (process.env.OBSERVATION_SELF_TEST_UNREACHABLE_API === 'true') {
    checks.push(await requestCheck(targetBaseUrl, 'deliberate unreachable api self-test', '/__not-api-v1-unreachable-observation-probe__', {
      requireJson: true,
      rejectVercelNotFound: true,
      statuses: [200, 400, 401, 403, 404, 422],
    }));
  }

  const apiReachability = checks.find((check) => check.name === 'known api application json');
  const overallStatus = checks.every((check) => check.ok) ? 'PASS' : 'FAIL';
  const report = {
    overallStatus,
    issue: 185,
    purpose: 'WP-07F production runtime and same-origin /api/v1 observation',
    commitSha,
    branchRef,
    productionDeploymentId,
    productionDeploymentUrl,
    productionAlias,
    targetBaseUrl,
    observationTimestamp: timestamp,
    artifactName,
    artifactDigest: null,
    apiReachabilityStatus: apiReachability?.ok ? 'PASS' : 'FAIL',
    checks,
  };
  report.artifactDigest = digest(JSON.stringify(report, null, 2));
  fs.writeFileSync(observationPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (overallStatus !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    overallStatus: 'FAIL',
    issue: 185,
    purpose: 'WP-07F production runtime and same-origin /api/v1 observation',
    observationTimestamp: timestamp,
    error: error instanceof Error ? error.message : String(error),
  };
  fs.writeFileSync(observationPath, JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
