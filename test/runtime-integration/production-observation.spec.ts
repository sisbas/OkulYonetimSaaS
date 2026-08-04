const observation = require('../../scripts/observe-production-runtime.js');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

const baseEnv = {
  OBSERVATION_TARGET_BASE_URL: 'https://preview.example.test',
  PRODUCTION_DEPLOYMENT_URL: 'https://deployment.example.test',
  PRODUCTION_DEPLOYMENT_ID: 'dpl_runtime_observation_test',
  PULL_REQUEST_HEAD_SHA: 'head-sha-for-test',
  EXPECTED_PR_HEAD_SHA: 'head-sha-for-test',
  GITHUB_REF_NAME: 'wp07f-pr1-production-reachability-v2',
  OBSERVATION_REQUEST_TIMEOUT_MS: '50',
};

describe('production runtime observation', () => {
  it('classifies a fast Nest health JSON response as PASS', async () => {
    const check = await observation.requestCheck('https://preview.example.test', 'known api application json', '/api/v1/health?token=secret-value', {
      requireJson: true,
      requiredJsonValues: {
        status: 'ok',
        service: 'okul-yonetim-saas-api',
        applicationType: 'backend-api',
      },
      statuses: [200],
      timeoutMs: 50,
      fetchImpl: async () => jsonResponse({
        status: 'ok',
        service: 'okul-yonetim-saas-api',
        applicationType: 'backend-api',
      }),
    });

    expect(check.ok).toBe(true);
    expect(check.failureReason).toBeNull();
    expect(check.url).not.toContain('secret-value');
    expect(check.pathname).not.toContain('secret-value');
  });

  it('rejects non-Nest JSON as unreachable API evidence', async () => {
    const check = await observation.requestCheck('https://preview.example.test', 'known api application json', '/api/v1/health', {
      requireJson: true,
      requiredJsonValues: {
        status: 'ok',
        service: 'okul-yonetim-saas-api',
        applicationType: 'backend-api',
      },
      statuses: [200],
      timeoutMs: 50,
      fetchImpl: async () => jsonResponse({ status: 'ok', applicationType: 'static-proxy' }),
    });

    expect(check.ok).toBe(false);
    expect(check.failureReason).toBe('API_UNREACHABLE');
    expect(check.jsonValueMismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'service', expected: 'okul-yonetim-saas-api' }),
      expect.objectContaining({ key: 'applicationType', expected: 'backend-api', actual: 'static-proxy' }),
    ]));
  });

  it('classifies a hanging request as bounded REQUEST_TIMEOUT without leaking URL query values', async () => {
    const check = await observation.requestCheck('https://preview.example.test', 'hanging api probe', '/api/v1/hang?secret=leaked-secret&branchId=raw-branch', {
      requireJson: true,
      statuses: [200],
      timeoutMs: 5,
      fetchImpl: (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('leaked https://preview.example.test/api/v1/hang?secret=leaked-secret&branchId=raw-branch token=abc123'));
        });
      }),
    });

    expect(check.ok).toBe(false);
    expect(check.failureReason).toBe('REQUEST_TIMEOUT');
    expect(check.error).toBe('Request timed out after 5ms');
    expect(JSON.stringify(check)).not.toContain('leaked-secret');
    expect(JSON.stringify(check)).not.toContain('raw-branch');
    expect(JSON.stringify(check)).not.toContain('abc123');
  });

  it('classifies protected-preview redirects as PROTECTED_PREVIEW_BLOCKED and never as API reachability PASS', async () => {
    const check = await observation.requestCheck('https://preview.example.test', 'known api application json', '/api/v1/health', {
      requireJson: true,
      rejectProtectedPreview: true,
      statuses: [200],
      timeoutMs: 50,
      fetchImpl: async () => new Response('Redirecting...', {
        status: 302,
        headers: {
          'content-type': 'text/plain',
          location: 'https://vercel.com/sso-api?url=https%3A%2F%2Fpreview.example.test%2Fapi%2Fv1%2Fhealth&nonce=synthetic',
        },
      }),
    });

    expect(check.ok).toBe(false);
    expect(check.protectedPreview).toBe(true);
    expect(check.failureReason).toBe('PROTECTED_PREVIEW_BLOCKED');
    expect(check.failureReason).not.toBe('API_UNREACHABLE');
    expect(check.failureReason).not.toBe('OBSERVATION_CHECK_FAILED');
  });

  it('keeps the deliberate self-test probe absent during normal observation and probes the public health endpoint', async () => {
    const checks = await observation.buildObservationChecks('https://preview.example.test', {
      env: baseEnv,
      timeoutMs: 50,
      fetchImpl: async (url: string) => url.includes('/api/v1/health')
        ? jsonResponse({
          status: 'ok',
          service: 'okul-yonetim-saas-api',
          applicationType: 'backend-api',
        })
        : htmlResponse('<html></html>', 200),
    });

    const apiCheck = checks.find((check: { name: string }) => check.name === 'known api application json');

    expect(checks.map((check: { name: string }) => check.name)).not.toContain('deliberate unreachable api self-test');
    expect(apiCheck).toBeDefined();
    expect(apiCheck.pathname).toBe('/api/v1/health');
  });

  it('isolates self-test observation to the deliberate probe with exact API_UNREACHABLE failure reason', async () => {
    const report = await observation.buildObservationReport({
      ...baseEnv,
      OBSERVATION_SELF_TEST_UNREACHABLE_API: 'true',
    }, async () => htmlResponse('The page could not be found: NOT_FOUND', 404));

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toEqual(['API_UNREACHABLE']);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].name).toBe('deliberate unreachable api self-test');
    expect(report.checks.some((check: { name: string }) => check.name === 'runtime shell')).toBe(false);
    expect(report.checks.some((check: { name: string }) => check.name === 'known api application json')).toBe(false);
  });

  it('redacts secrets, bearer tokens and full URL query values', () => {
    const redacted = observation.redact('Bearer eyJhbGciOiJIUzI1 token=plain-secret https://preview.example.test/api/v1/check?secret=raw-secret&branchId=raw-branch');

    expect(redacted).toContain('Bearer <redacted>');
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1');
    expect(redacted).not.toContain('plain-secret');
    expect(redacted).not.toContain('raw-secret');
    expect(redacted).not.toContain('raw-branch');
  });
});
