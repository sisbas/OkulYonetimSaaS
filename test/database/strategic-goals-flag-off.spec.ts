import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

/**
 * #482 — Flag KAPALI (varsayılan) gerçek `AppModule` davranışı.
 *
 * Modül hiç kaydedilmez → route eşleşmez → kimlik doğrulaması olmadan bile
 * 404. 401/403 değil, çünkü istek auth katmanına ulaşmaz (varlık sızmaz).
 *
 * neden ayrı dosya: Jest modül kaydı dosya başına izoledir. Aynı dosyada
 * `jest.resetModules()` + dinamik `AppModule` import'u iki farklı
 * `@nestjs/core` kopyası yüzünden `TypeOrmCoreModule` DI hatası üretiyordu.
 *
 * PostgreSQL gerektirir; CI DB Smoke `test:database:required` altında skip
 * yasağıyla koşar.
 */
const hasDatabaseConfig = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);
const describeIfDb = hasDatabaseConfig ? describe : describe.skip;

jest.setTimeout(120_000);

describeIfDb('#482 strategic goals flag OFF (real AppModule)', () => {
  const previousFlag = process.env.STRATEGIC_GOALS_ENABLED;
  const previousFallback = process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
  let app: Awaited<ReturnType<typeof bootApp>> | undefined;

  async function bootApp() {
    delete process.env.STRATEGIC_GOALS_ENABLED;
    process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = 'false';
    // Kapı modül yüklenirken değerlendirilir: import'tan ÖNCE ayarla.
    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nestApp = moduleRef.createNestApplication();
    nestApp.setGlobalPrefix('api/v1');
    await nestApp.listen(0, '127.0.0.1');
    return { nestApp, baseUrl: await nestApp.getUrl() };
  }

  afterEach(async () => {
    if (app) await app.nestApp.close();
    app = undefined;
    if (previousFlag === undefined) delete process.env.STRATEGIC_GOALS_ENABLED;
    else process.env.STRATEGIC_GOALS_ENABLED = previousFlag;
    if (previousFallback === undefined) delete process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
    else process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = previousFallback;
  });

  it('answers 404 on every strategic-goals route while the flag is off', async () => {
    app = await bootApp();
    expect(app.nestApp.get(DataSource).isInitialized).toBe(true);

    const surfaceId = '11111111-1111-4111-8111-111111111111';
    const requests: Array<[string, string]> = [
      ['GET', '/api/v1/strategic-goals'],
      ['POST', '/api/v1/strategic-goals'],
      ['GET', `/api/v1/strategic-goals/${surfaceId}`],
      ['PATCH', `/api/v1/strategic-goals/${surfaceId}`],
      ['DELETE', `/api/v1/strategic-goals/${surfaceId}`],
    ];
    for (const [method, path] of requests) {
      const response = await fetch(`${app.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
      });
      expect({ method, path, status: response.status }).toEqual({ method, path, status: 404 });
      const body = (await response.json()) as { statusCode?: number; message?: string };
      // Nest'in gerçek 404 zarfı: route eşleşmedi (401/403 veya iş kuralı değil).
      expect(body.statusCode).toBe(404);
      expect(String(body.message)).toMatch(/^Cannot (GET|POST|PATCH|DELETE) /);
      expect(JSON.stringify(body)).not.toContain('strategic_goal');
    }
  });
});
