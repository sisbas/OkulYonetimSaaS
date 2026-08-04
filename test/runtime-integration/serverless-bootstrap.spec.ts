import {
  __resetCreateNestHandlerForTest,
  __setCreateNestHandlerForTest,
  getCachedNestHandler,
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
});
