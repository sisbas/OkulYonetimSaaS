const { NORMAL_ROUTES, observeProductionRuntime } = require('../../scripts/observe-production-runtime');

const response = (body: string, init: ResponseInit) => new Response(body, init);

describe('production observation', () => {
  it('observes the complete normal route matrix', () => {
    expect(NORMAL_ROUTES.map(({ route }: { route: string }) => route)).toEqual([
      '/runtime', '/runtime/app.js', '/', '/demo', '/full-vision', '/api/v1/auth/me',
    ]);
  });

  it('reports PASS for valid pages and a Nest-controlled API response', async () => {
    const artifact = await observeProductionRuntime({
      baseUrl: 'https://deployment.example',
      fetchImpl: jest.fn(async (url: URL) => url.pathname.startsWith('/api/')
        ? response('{"statusCode":401,"message":"Unauthorized"}', { status: 401, headers: { 'content-type': 'application/json', 'x-powered-by': 'Express' } })
        : response('ok', { status: 200, headers: { 'content-type': url.pathname.endsWith('.js') ? 'application/javascript' : 'text/html' } })),
    });
    expect(artifact.overallStatus).toBe('PASS');
    expect(artifact.failureReasons).toEqual([]);
  });

  it('classifies REQUEST_TIMEOUT', async () => {
    const fetchImpl = jest.fn((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })));
    }));
    const artifact = await observeProductionRuntime({ baseUrl: 'https://deployment.example', fetchImpl, routes: [{ route: '/', kind: 'html' }], timeoutMs: 1 });
    expect(artifact.failureReasons).toEqual(['REQUEST_TIMEOUT']);
  });

  it('isolates API_UNREACHABLE from non-API observation failures', async () => {
    const artifact = await observeProductionRuntime({
      baseUrl: 'https://deployment.example',
      routes: [{ route: '/api/v1/auth/me', kind: 'api' }],
      fetchImpl: jest.fn(async () => { throw new Error('connect failed'); }),
    });
    expect(artifact.failureReasons).toEqual(['API_UNREACHABLE']);
  });

  it('recovers after an initial bootstrap failure', async () => {
    const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('booting')).mockResolvedValueOnce(
      response('{"statusCode":401,"message":"Unauthorized"}', { status: 401, headers: { 'content-type': 'application/json', 'x-powered-by': 'Express' } }),
    );
    const failed = await observeProductionRuntime({ baseUrl: 'https://deployment.example', fetchImpl, routes: [{ route: '/api/v1/auth/me', kind: 'api' }] });
    const recovered = await observeProductionRuntime({ baseUrl: 'https://deployment.example', fetchImpl, routes: [{ route: '/api/v1/auth/me', kind: 'api' }] });
    expect(failed.overallStatus).toBe('FAIL');
    expect(recovered.overallStatus).toBe('PASS');
  });

  it('blocks a 302 text/plain Vercel protected-preview redirect without misclassification', async () => {
    const artifact = await observeProductionRuntime({
      baseUrl: 'https://deployment.example', rejectProtectedPreview: true,
      routes: [{ route: '/api/v1/auth/me', kind: 'api' }],
      fetchImpl: jest.fn(async () => response('Authentication Required', {
        status: 302,
        headers: { 'content-type': 'text/plain', location: 'https://vercel.com/sso?url=https%3A%2F%2Fdeployment.example' },
      })),
    });
    expect(artifact.ok).toBe(false);
    expect(artifact.protectedPreview).toBe(true);
    expect(artifact.failureReason).toBe('PROTECTED_PREVIEW_BLOCKED');
    expect(artifact.overallStatus).not.toBe('PASS');
    expect(artifact.failureReasons).not.toContain('API_UNREACHABLE');
    expect(artifact.failureReasons).not.toContain('OBSERVATION_CHECK_FAILED');
  });

  it.each([
    ['Vercel NOT_FOUND', '{"error":"NOT_FOUND"}', 404, 'application/json', {}],
    ['static HTML', '<html>fallback</html>', 200, 'text/html', {}],
    ['protected redirect', '', 302, 'text/html', { location: 'https://deployment.example/_vercel/auth' }],
    ['302 text/plain', 'redirect', 302, 'text/plain', { location: '/login' }],
  ])('rejects %s as API acceptance', async (_name, body, status, contentType, extraHeaders) => {
    const artifact = await observeProductionRuntime({
      baseUrl: 'https://deployment.example', routes: [{ route: '/api/v1/auth/me', kind: 'api' }],
      fetchImpl: jest.fn(async () => response(body as string, { status: status as number, headers: { 'content-type': contentType as string, ...(extraHeaders as object) } })),
    });
    expect(artifact.overallStatus).toBe('FAIL');
  });
});
