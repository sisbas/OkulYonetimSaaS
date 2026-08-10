import {
  __resetCreateNestHandlerForTest,
  __setCreateNestHandlerForTest,
  getCachedNestHandler,
  restoreRewrittenApiRequestUrl,
} from '../../api/v1/index';

describe('Vercel serverless Nest bootstrap cache', () => {
  afterEach(() => {
    __resetCreateNestHandlerForTest();
  });

  it('clears a rejected bootstrap promise so the next invocation can retry', async () => {
    const runtimeHandler = jest.fn();
    let attempts = 0;

    __setCreateNestHandlerForTest(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('synthetic bootstrap failure');
      }
      return runtimeHandler;
    });

    await expect(getCachedNestHandler()).rejects.toThrow('synthetic bootstrap failure');
    await expect(getCachedNestHandler()).resolves.toBe(runtimeHandler);
    expect(attempts).toBe(2);
  });

  it('reuses a successful bootstrap promise for concurrent and warm invocations', async () => {
    const runtimeHandler = jest.fn();
    let attempts = 0;

    __setCreateNestHandlerForTest(async () => {
      attempts += 1;
      return runtimeHandler;
    });

    const [first, second] = await Promise.all([
      getCachedNestHandler(),
      getCachedNestHandler(),
    ]);

    expect(first).toBe(runtimeHandler);
    expect(second).toBe(runtimeHandler);
    expect(attempts).toBe(1);

    await expect(getCachedNestHandler()).resolves.toBe(runtimeHandler);
    expect(attempts).toBe(1);
  });

  it('restores the original nested API path while preserving request semantics', () => {
    const request = {
      url: '/api/v1?__vercelApiPath=daily-operations/today&branchId=branch-1&date=2026-08-10',
      method: 'POST',
      headers: { authorization: 'synthetic-auth-header', 'x-tenant-id': 'tenant-1' },
      body: { marker: 'preserved' },
    };
    const originalMethod = request.method;
    const originalHeaders = request.headers;
    const originalBody = request.body;

    restoreRewrittenApiRequestUrl(request);

    expect(request.url).toBe('/api/v1/daily-operations/today?branchId=branch-1&date=2026-08-10');
    expect(request.method).toBe(originalMethod);
    expect(request.headers).toBe(originalHeaders);
    expect(request.body).toBe(originalBody);
  });

  it('leaves direct API function requests unchanged when no rewrite marker exists', () => {
    const request = { url: '/api/v1?branchId=branch-1' };

    restoreRewrittenApiRequestUrl(request);

    expect(request.url).toBe('/api/v1?branchId=branch-1');
  });
});
