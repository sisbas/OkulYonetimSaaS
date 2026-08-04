#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NORMAL_ROUTES = [
  { route: '/runtime', kind: 'html' },
  { route: '/runtime/app.js', kind: 'javascript' },
  { route: '/', kind: 'html' },
  { route: '/demo', kind: 'html' },
  { route: '/full-vision', kind: 'html' },
  { route: '/api/v1/auth/me', kind: 'api' },
];

const SECRET_KEY = /(authorization|cookie|token|secret|password|credential|database_url|db_)/i;
const PROTECTION_LOCATION = /(vercel\.com\/sso|vercel\.app\/_vercel\/sso|_vercel\/auth|vercel-protection)/i;

function protectedPreview(response) {
  const location = response.headers.get('location') || '';
  return response.status >= 300 && response.status < 400 && PROTECTION_LOCATION.test(location);
}

function safeLocation(location) {
  if (!location) return '';
  try {
    const parsed = new URL(location, 'https://redacted.invalid');
    return parsed.origin === 'https://redacted.invalid' ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch (_) {
    return '[invalid location]';
  }
}

async function inspectResponse(response, check) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const location = response.headers.get('location') || '';
  const isProtected = protectedPreview(response);
  let accepted = false;

  if (check.kind === 'api') {
    let jsonControlled = false;
    if (contentType.includes('application/json')) {
      try {
        const value = JSON.parse(await response.text());
        jsonControlled = value !== null && typeof value === 'object' &&
          !(/not_found/i.test(String(value.error || value.code || ''))) &&
          (response.headers.has('x-powered-by') ||
            ['message', 'statusCode', 'error', 'data'].some((key) => Object.prototype.hasOwnProperty.call(value, key)));
      } catch (_) {
        jsonControlled = false;
      }
    }
    accepted = response.status >= 200 && response.status < 500 && jsonControlled && !isProtected;
  } else if (check.kind === 'javascript') {
    accepted = response.ok && /(javascript|text\/plain)/.test(contentType);
  } else {
    accepted = response.ok && contentType.includes('text/html');
  }

  return {
    route: check.route,
    status: response.status,
    contentType,
    ...(location ? { location: safeLocation(location) } : {}),
    ok: accepted,
    protectedPreview: isProtected,
  };
}

function publicMetadata(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !SECRET_KEY.test(key)));
}

async function observeProductionRuntime(options) {
  const {
    baseUrl,
    fetchImpl = global.fetch,
    routes = NORMAL_ROUTES,
    timeoutMs = 10_000,
    rejectProtectedPreview = true,
    selfTest = false,
    metadata = {},
    now = () => new Date(),
  } = options;

  const checks = selfTest
    ? [{ route: '/api/v1/deliberate-unreachable-self-test', kind: 'api', name: 'deliberate unreachable api self-test', deliberateUnreachable: true }]
    : routes;
  const results = [];
  const failureReasons = [];

  for (const check of checks) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (check.deliberateUnreachable) throw Object.assign(new Error('deliberate unreachable API'), { code: 'ENETUNREACH' });
      const response = await fetchImpl(new URL(check.route, baseUrl), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: check.kind === 'api' ? 'application/json' : '*/*' },
      });
      const result = await inspectResponse(response, check);
      let failureReason;
      if (result.protectedPreview && rejectProtectedPreview) failureReason = 'PROTECTED_PREVIEW_BLOCKED';
      else if (!result.ok) failureReason = 'OBSERVATION_CHECK_FAILED';
      results.push({ name: check.name || check.route, ...result, ...(failureReason ? { failureReason } : {}) });
      if (failureReason) failureReasons.push(failureReason);
    } catch (error) {
      const failureReason = error && error.name === 'AbortError' ? 'REQUEST_TIMEOUT' :
        check.kind === 'api' ? 'API_UNREACHABLE' : 'OBSERVATION_CHECK_FAILED';
      results.push({ name: check.name || check.route, route: check.route, ok: false, protectedPreview: false, failureReason });
      failureReasons.push(failureReason);
    } finally {
      clearTimeout(timer);
    }
  }

  const uniqueFailures = [...new Set(failureReasons)];
  return {
    ...publicMetadata(metadata),
    targetBaseUrl: baseUrl,
    timestamp: now().toISOString(),
    checks: results,
    routeStatusContentTypeMatrix: results.map(({ route, status, contentType }) => ({ route, status: status ?? null, contentType: contentType || null })),
    failureReasonMatrix: results.map(({ route, failureReason }) => ({ route, failureReason: failureReason || 'PASS' })),
    failureReasons: uniqueFailures,
    overallStatus: uniqueFailures.length ? 'FAIL' : 'PASS',
    ok: uniqueFailures.length === 0,
    protectedPreview: results.some((result) => result.protectedPreview),
    ...(uniqueFailures.length === 1 ? { failureReason: uniqueFailures[0] } : {}),
  };
}

async function main() {
  const selfTest = process.argv.includes('--self-test');
  const baseUrl = selfTest ? 'http://127.0.0.1:1' : process.env.TARGET_BASE_URL;
  if (!baseUrl) throw new Error('TARGET_BASE_URL is required');
  const artifact = await observeProductionRuntime({
    baseUrl,
    selfTest,
    rejectProtectedPreview: true,
    metadata: {
      commitSha: process.env.GITHUB_SHA || '',
      expectedHeadSha: process.env.EXPECTED_HEAD_SHA || '',
      branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '',
      ref: process.env.GITHUB_REF || '',
      deploymentUrl: process.env.DEPLOYMENT_URL || '',
      deploymentId: process.env.DEPLOYMENT_ID || '',
      alias: process.env.DEPLOYMENT_ALIAS || '',
    },
  });
  const output = process.env.OBSERVATION_ARTIFACT || 'artifacts/production-observation/observation.json';
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  if (artifact.overallStatus !== 'PASS' && !selfTest) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { NORMAL_ROUTES, inspectResponse, observeProductionRuntime, protectedPreview };
