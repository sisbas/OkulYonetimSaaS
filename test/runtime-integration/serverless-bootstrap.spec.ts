import type { Request, Response } from 'express';

import handler, {
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
      query: {
        __vercelApiPath: 'daily-operations/today',
        branchId: 'branch-1',
        date: '2026-08-10',
      },
      method: 'POST',
      headers: { authorization: 'synthetic-auth-header', 'x-tenant-id': 'tenant-1' },
      body: { marker: 'preserved' },
    };
    const originalMethod = request.method;
    const originalHeaders = request.headers;
    const originalBody = request.body;

    restoreRewrittenApiRequestUrl(request);

    expect(request.url).toBe('/api/v1/daily-operations/today?branchId=branch-1&date=2026-08-10');
    expect(request.query).toEqual({ branchId: 'branch-1', date: '2026-08-10' });
    expect(request.method).toBe(originalMethod);
    expect(request.headers).toBe(originalHeaders);
    expect(request.body).toBe(originalBody);
  });

  it('exercises nested path restoration through the default serverless handler', async () => {
    const runtimeHandler = jest.fn();
    __setCreateNestHandlerForTest(async () => runtimeHandler);
    const request = {
      url: '/api/v1?__vercelApiPath=leaves/me&branchId=branch-1',
      query: { __vercelApiPath: 'leaves/me', branchId: 'branch-1' },
    } as unknown as Request;
    const response = {} as Response;

    await handler(request, response);

    expect(request.url).toBe('/api/v1/leaves/me?branchId=branch-1');
    expect(request.query).toEqual({ branchId: 'branch-1' });
    expect(runtimeHandler).toHaveBeenCalledTimes(1);
    expect(runtimeHandler).toHaveBeenCalledWith(request, response);
  });

  it('strips an empty rewrite marker without changing the API function path', () => {
    const request = {
      url: '/api/v1?__vercelApiPath=&branchId=branch-1',
      query: { __vercelApiPath: '', branchId: 'branch-1' },
    };

    restoreRewrittenApiRequestUrl(request);

    expect(request.url).toBe('/api/v1?branchId=branch-1');
    expect(request.query).toEqual({ branchId: 'branch-1' });
  });

  it.each([
    '../admin',
    '%2E%2E%2Fadmin',
    'a/%2e%2e/admin',
  ])('rejects unsafe nested rewrite marker %s without escaping the API prefix', (encodedPath) => {
    const request = {
      url: `/api/v1?__vercelApiPath=${encodedPath}&branchId=branch-1`,
      query: { __vercelApiPath: encodedPath, branchId: 'branch-1' },
    };

    restoreRewrittenApiRequestUrl(request);

    expect(request.url).toBe('/api/v1?branchId=branch-1');
    expect(request.query).toEqual({ branchId: 'branch-1' });
  });

  it('does not let a reserved marker replace an already-nested application path', () => {
    const request = {
      url: '/api/v1/health?__vercelApiPath=leaves/me&probe=1',
      query: { __vercelApiPath: 'leaves/me', probe: '1' },
    };

    restoreRewrittenApiRequestUrl(request);

    expect(request.url).toBe('/api/v1/health?probe=1');
    expect(request.query).toEqual({ probe: '1' });
  });

  it('leaves direct API function requests unchanged when no rewrite marker exists', () => {
    const request = {
      url: '/api/v1?branchId=branch-1',
      query: { branchId: 'branch-1' },
    };

    restoreRewrittenApiRequestUrl(request);

    expect(request.url).toBe('/api/v1?branchId=branch-1');
    expect(request.query).toEqual({ branchId: 'branch-1' });
  });
});
