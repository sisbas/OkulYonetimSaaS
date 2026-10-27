import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

/**
 * #482 — `STRATEGIC_GOALS_ENABLED` kapılı yüzeyin GERÇEK Nest uygulamasıyla
 * HTTP davranışı (ADR 0003 D2/D3).
 *
 * İki yön de kanıtlanır:
 *  - kapalı (varsayılan): modül hiç kaydedilmez → kimlik doğrulaması olmadan
 *    bile 404; 401/403 değil, çünkü route eşleşmesi yoktur (varlık sızmaz).
 *  - açık: route kaydedilir → istek 404 değil 401 alır (auth guard devrede).
 *
 * Bu spec PostgreSQL gerektirir; CI DB Smoke `test:database:required`
 * altında skip yasağıyla koşar. DB'siz bir "module-less app" testi gerçek
 * grafiği kanıtlamadığı için (bağımsız review MAJOR 2) kaldırılmıştır.
 */
const hasDatabaseConfig = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);
const describeIfDb = hasDatabaseConfig ? describe : describe.skip;

jest.setTimeout(180_000);

async function bootApp(flagValue: string | undefined) {
  delete process.env.STRATEGIC_GOALS_ENABLED;
  if (flagValue !== undefined) process.env.STRATEGIC_GOALS_ENABLED = flagValue;
  process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = 'false';
  // Route kaydı modül yüklenirken değerlendirilir: import'tan ÖNCE ayarla.
  jest.resetModules();
  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  return { app, baseUrl };
}

describeIfDb('#482 strategic goals deploy flag (real AppModule)', () => {
  const previousFlag = process.env.STRATEGIC_GOALS_ENABLED;
  const previousFallback = process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
  let booted: Awaited<ReturnType<typeof bootApp>> | undefined;

  afterEach(async () => {
    if (booted) await booted.app.close();
    booted = undefined;
    if (previousFlag === undefined) delete process.env.STRATEGIC_GOALS_ENABLED;
    else process.env.STRATEGIC_GOALS_ENABLED = previousFlag;
    if (previousFallback === undefined) delete process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
    else process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = previousFallback;
  });

  it('answers 404 on every strategic-goals route while the flag is off', async () => {
    booted = await bootApp(undefined);
    expect(booted.app.get(DataSource).isInitialized).toBe(true);

    const surfaceId = '11111111-1111-4111-8111-111111111111';
    const requests: Array<[string, string]> = [
      ['GET', '/api/v1/strategic-goals'],
      ['POST', '/api/v1/strategic-goals'],
      ['GET', `/api/v1/strategic-goals/${surfaceId}`],
      ['PATCH', `/api/v1/strategic-goals/${surfaceId}`],
      ['DELETE', `/api/v1/strategic-goals/${surfaceId}`],
    ];
    for (const [method, path] of requests) {
      const response = await fetch(`${booted.baseUrl}${path}`, {
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

  it('registers the routes while the flag is on (401, never 404)', async () => {
    booted = await bootApp('true');
    for (const [method, path] of [
      ['GET', '/api/v1/strategic-goals'],
      ['POST', '/api/v1/strategic-goals'],
    ] as const) {
      const response = await fetch(`${booted.baseUrl}${path}`, {
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
