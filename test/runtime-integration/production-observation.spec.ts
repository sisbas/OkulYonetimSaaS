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
    headers: {
      'content-type': 'text/html',
      'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    },
  });
}

const baseEnv = {
  OBSERVATION_TARGET_BASE_URL: 'https://preview.example.test',
  PRODUCTION_DEPLOYMENT_URL: 'https://deployment.example.test',
  PRODUCTION_DEPLOYMENT_ID: 'dpl_runtime_observation_test',
  PULL_REQUEST_HEAD_SHA: '0123456789abcdef0123456789abcdef01234567',
  EXPECTED_PR_HEAD_SHA: '0123456789abcdef0123456789abcdef01234567',
  GITHUB_REF_NAME: 'wp07f-pr1-production-reachability-v2',
  OBSERVATION_REQUEST_TIMEOUT_MS: '50',
  VERCEL_DEPLOYMENT_METADATA_TOKEN: 'metadata-token-for-test',
};

const vercelMetadata = (sha = baseEnv.EXPECTED_PR_HEAD_SHA) => ({
  url: 'preview.example.test',
  alias: ['deployment.example.test'],
  meta: {
    githubCommitSha: sha,
  },
});

function withDeploymentMetadata(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
  sha = baseEnv.EXPECTED_PR_HEAD_SHA,
) {
  return async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('https://api.vercel.com/')) {
      expect(init?.headers).toEqual(expect.objectContaining({ authorization: expect.stringMatching(/^Bearer /) }));
      return jsonResponse(vercelMetadata(sha));
    }
    return handler(url, init);
  };
}

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
      expect.objectContaining({ key: 'applicationType', expected: 'backend-api', actualType: 'string' }),
    ]));
    expect(JSON.stringify(check)).not.toContain('static-proxy');
  });

  it('never serializes a reflected protection bypass secret in JSON mismatch evidence', async () => {
    const bypassSecret = 'synthetic-bypass-secret-that-must-not-leak';
    const check = await observation.requestCheck('https://preview.example.test', 'known api application json', '/api/v1/health', {
      env: { VERCEL_PROTECTION_BYPASS_SECRET: bypassSecret },
      requireJson: true,
      requiredJsonValues: { service: 'okul-yonetim-saas-api' },
      statuses: [200],
      timeoutMs: 50,
      fetchImpl: async () => jsonResponse({ service: bypassSecret }),
    });

    expect(check.ok).toBe(false);
    expect(check.jsonValueMismatches).toEqual([{ key: 'service', expected: 'okul-yonetim-saas-api', actualType: 'string' }]);
    expect(JSON.stringify(check)).not.toContain(bypassSecret);
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

  it('requires Vercel deployment metadata SHA to match the expected head before PASS', async () => {
    const report = await observation.buildObservationReport(baseEnv, withDeploymentMetadata(async (url: string) => url.includes('/api/v1/health')
      ? jsonResponse({
        status: 'ok',
        service: 'okul-yonetim-saas-api',
        applicationType: 'backend-api',
      })
      : htmlResponse('<html></html>', 200)));

    expect(report.deploymentCommitSha).toBe(baseEnv.EXPECTED_PR_HEAD_SHA);
    expect(report.deploymentCommitSource).toBe('vercel_deployment_metadata');
    expect(report.deploymentMetadataStatus).toBe('PASS');
    expect(report.overallStatus).toBe('PASS');
    expect(report.failureReasons).toEqual([]);
    expect(report.failureReasons).not.toContain('STALE_DEPLOYMENT');
  });

  it('fails closed when the expected PR head SHA is missing', async () => {
    const report = await observation.buildObservationReport({
      ...baseEnv,
      EXPECTED_PR_HEAD_SHA: '',
    }, withDeploymentMetadata(async (url: string) => url.includes('/api/v1/health')
      ? jsonResponse({ status: 'ok', service: 'okul-yonetim-saas-api', applicationType: 'backend-api' })
      : htmlResponse('<html></html>', 200)));

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toContain('MISSING_EXPECTED_PR_HEAD_SHA');
  });

  it('fails closed when deployment metadata is bound to a different host', async () => {
    const fetchImpl = async (url: string) => String(url).startsWith('https://api.vercel.com/')
      ? jsonResponse({ ...vercelMetadata(), url: 'other-deployment.example.test', alias: [] })
      : url.includes('/api/v1/health')
        ? jsonResponse({ status: 'ok', service: 'okul-yonetim-saas-api', applicationType: 'backend-api' })
        : htmlResponse('<html></html>', 200);
    const report = await observation.buildObservationReport(baseEnv, fetchImpl);

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toContain('DEPLOYMENT_TARGET_MISMATCH');
  });

  it('bounds a hanging deployment metadata request', async () => {
    const report = await observation.buildObservationReport({
      ...baseEnv,
      OBSERVATION_REQUEST_TIMEOUT_MS: '5',
    }, (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toContain('DEPLOYMENT_METADATA_TIMEOUT');
  });

  it('labels the pre-upload report digest separately from GitHub artifact digest', async () => {
    const report = await observation.buildObservationReport(baseEnv, withDeploymentMetadata(async (url: string) => url.includes('/api/v1/health')
      ? jsonResponse({
        status: 'ok',
        service: 'okul-yonetim-saas-api',
        applicationType: 'backend-api',
      })
      : htmlResponse('<html></html>', 200)));

    expect(Object.prototype.hasOwnProperty.call(report, 'reportContentDigest')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(report, 'artifactDigest')).toBe(false);
    const firstDigest = observation.buildReportContentDigest(report);
    report.reportContentDigest = firstDigest;
    expect(observation.buildReportContentDigest(report)).toBe(firstDigest);
  });

  it('rejects a stale deployment even when observed routes otherwise pass', async () => {
    const staleSha = 'ffffffffffffffffffffffffffffffffffffffff';
    const report = await observation.buildObservationReport(baseEnv, withDeploymentMetadata(async (url: string) => url.includes('/api/v1/health')
      ? jsonResponse({
        status: 'ok',
        service: 'okul-yonetim-saas-api',
        applicationType: 'backend-api',
      })
      : htmlResponse('<html></html>', 200), staleSha));

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toContain('STALE_DEPLOYMENT');
    expect(report.identityChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        failureReason: 'STALE_DEPLOYMENT',
        expectedHeadSha: baseEnv.EXPECTED_PR_HEAD_SHA,
        deploymentCommitSha: staleSha,
      }),
    ]));
  });

  it('blocks observation when deployment metadata auth is unavailable', async () => {
    const report = await observation.buildObservationReport({
      ...baseEnv,
      VERCEL_DEPLOYMENT_METADATA_TOKEN: '',
    }, withDeploymentMetadata(async () => htmlResponse('<html></html>', 200)));

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toContain('MISSING_DEPLOYMENT_METADATA_AUTH');
  });

  it('returns early without probing target when deployment metadata fails with DEPLOYMENT_TARGET_MISMATCH', async () => {
    const targetRequests: string[] = [];
    const fetchImpl = async (url: string) => {
      if (String(url).startsWith('https://api.vercel.com/')) {
        return jsonResponse({ ...vercelMetadata(), url: 'other-deployment.example.test', alias: [] });
      }
      targetRequests.push(url);
      return url.includes('/api/v1/health')
        ? jsonResponse({ status: 'ok', service: 'okul-yonetim-saas-api', applicationType: 'backend-api' })
        : htmlResponse('<html></html>', 200);
    };
    const report = await observation.buildObservationReport(baseEnv, fetchImpl);

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toContain('DEPLOYMENT_TARGET_MISMATCH');
    expect(report.checks).toEqual([]);
    expect(targetRequests).toEqual([]);
  });

  it('builds fallback failure reports with the full identity schema and original failure reason', () => {
    const error = Object.assign(new Error('missing https://preview.example.test/api?secret=raw-secret token=abc123'), {
      canonicalReason: 'MISSING_ENVIRONMENT',
    });
    const report = observation.buildFailureReport(error, baseEnv);

    expect(report.overallStatus).toBe('FAIL');
    expect(report.failureReasons).toEqual(['MISSING_ENVIRONMENT']);
    expect(report.commitSha).toBe(baseEnv.PULL_REQUEST_HEAD_SHA);
    expect(report.expectedHeadSha).toBe(baseEnv.EXPECTED_PR_HEAD_SHA);
    expect(report.branchRef).toBe(baseEnv.GITHUB_REF_NAME);
    expect(report.productionDeploymentId).toBe(baseEnv.PRODUCTION_DEPLOYMENT_ID);
    expect(report.targetBaseUrl).toBe('https://preview.example.test/');
    expect(report.artifactName).toBe(`wp07f-production-observation-${baseEnv.PULL_REQUEST_HEAD_SHA}`);
    expect(report.apiReachabilityStatus).toBe('FAIL');
    expect(report.checks).toEqual([]);
    expect(report.identityChecks).toEqual([{ ok: false, failureReason: 'MISSING_ENVIRONMENT' }]);
    expect(Object.prototype.hasOwnProperty.call(report, 'reportContentDigest')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(report, 'artifactDigest')).toBe(false);
    expect(report.error).not.toContain('raw-secret');
    expect(report.error).not.toContain('abc123');
  });

  it('isolates self-test observation to the deliberate probe with exact API_UNREACHABLE failure reason when deployment metadata matches', async () => {
    const report = await observation.buildObservationReport({
      ...baseEnv,
      OBSERVATION_SELF_TEST_UNREACHABLE_API: 'true',
    }, withDeploymentMetadata(async () => htmlResponse('The page could not be found: NOT_FOUND', 404)));

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

  it('rejects HTTP target URLs to prevent bypass secret transmission over unencrypted connections', async () => {
    const httpEnv = {
      ...baseEnv,
      OBSERVATION_TARGET_BASE_URL: 'http://insecure.example.test',
    };

    await expect(async () => {
      await observation.buildObservationReport(httpEnv, async () => htmlResponse('<html></html>', 200));
    }).rejects.toThrow('Target URL must use HTTPS protocol to protect secrets in transit');

    try {
      await observation.buildObservationReport(httpEnv, async () => htmlResponse('<html></html>', 200));
    } catch (error: unknown) {
      expect((error as { canonicalReason?: string }).canonicalReason).toBe('INSECURE_TARGET_PROTOCOL');
    }
  });
});
