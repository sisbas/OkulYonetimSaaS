import { Test } from '@nestjs/testing';

/**
 * #482 — Flag AÇIK gerçek `AppModule` davranışı.
 *
 * `STRATEGIC_GOALS_ENABLED=true` iken route kayıtlıdır: kimlik doğrulaması
 * olmayan istek 404 değil 401 alır. Bu, `imports` içindeki
 * `...buildFeatureModules()` kablolamasının gerçekten tüketildiğini kanıtlar
 * (bağımsız review MAJOR 1). Ayrı dosyadadır çünkü Jest modül kaydı dosya
 * başına izoledir ve `AppModule` import anındaki env'i okur.
 *
 * PostgreSQL gerektirir; CI DB Smoke'ta skip yasağıyla koşar.
 */
const hasDatabaseConfig = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);
const describeIfDb = hasDatabaseConfig ? describe : describe.skip;

jest.setTimeout(120_000);

describeIfDb('#482 strategic goals flag ON (real AppModule)', () => {
  const previousFlag = process.env.STRATEGIC_GOALS_ENABLED;
  const previousFallback = process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
  let nestApp: Awaited<ReturnType<typeof bootApp>> | undefined;

  async function bootApp() {
    process.env.STRATEGIC_GOALS_ENABLED = 'true';
    process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = 'false';
    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    return { app, baseUrl: await app.getUrl() };
  }

  afterEach(async () => {
    if (nestApp) await nestApp.app.close();
    nestApp = undefined;
    if (previousFlag === undefined) delete process.env.STRATEGIC_GOALS_ENABLED;
    else process.env.STRATEGIC_GOALS_ENABLED = previousFlag;
    if (previousFallback === undefined) delete process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
    else process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = previousFallback;
  });

  it('registers the routes while the flag is on (401, never 404)', async () => {
    nestApp = await bootApp();
    for (const [method, path] of [
      ['GET', '/api/v1/strategic-goals'],
      ['POST', '/api/v1/strategic-goals'],
    ] as const) {
      const response = await fetch(`${nestApp.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' }),
      });
      // Route kayıtlı: kimlik doğrulaması yok → 401. 404 olsaydı kapı yanlış
      // yönde çalışıyor (flag açıkken yüzey kaybolmuş) demek olurdu.
      expect({ method, path, status: response.status }).toEqual({ method, path, status: 401 });
    }
  });
});
