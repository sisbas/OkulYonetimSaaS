import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

/**
 * #482 — `STRATEGIC_GOALS_ENABLED` kapalıyken stratejik hedefler yüzeyi
 * router'a HİÇ kaydedilmemelidir (ADR 0003 D2/D3).
 *
 * Kanıt yalnız birim liste uzunluğu değil, gerçek Nest uygulamasının gerçek
 * HTTP yanıtıdır: kimlik doğrulaması olmayan istekler bile 401/403 değil 404
 * alır — böylece yüzeyin varlığı sızmaz. Bu spec PostgreSQL gerektirir;
 * CI DB Smoke `test:database:required` altında (skip yasak) koşar.
 */
const hasDatabaseConfig = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);
const describeIfDb = hasDatabaseConfig ? describe : describe.skip;

jest.setTimeout(120_000);

describeIfDb('#482 strategic goals deploy flag (real AppModule)', () => {
  const previousFlag = process.env.STRATEGIC_GOALS_ENABLED;
  const previousFallback = process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.STRATEGIC_GOALS_ENABLED;
    else process.env.STRATEGIC_GOALS_ENABLED = previousFlag;
    if (previousFallback === undefined) delete process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK;
    else process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = previousFallback;
  });

  it('answers 404 on every strategic-goals route while the flag is off', async () => {
    delete process.env.STRATEGIC_GOALS_ENABLED;
    process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = 'false';
    // Gate modül yüklenirken değerlendirilir: import'tan ÖNCE ayarla.
    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    try {
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      const baseUrl = await app.getUrl();
      expect(app.get(DataSource).isInitialized).toBe(true);

      const surfaceId = '11111111-1111-4111-8111-111111111111';
      const requests: Array<[string, string]> = [
        ['GET', '/api/v1/strategic-goals'],
        ['POST', '/api/v1/strategic-goals'],
        ['GET', `/api/v1/strategic-goals/${surfaceId}`],
        ['PATCH', `/api/v1/strategic-goals/${surfaceId}`],
        ['DELETE', `/api/v1/strategic-goals/${surfaceId}`],
      ];
      for (const [method, path] of requests) {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
        });
        expect({ method, path, status: response.status }).toEqual({ method, path, status: 404 });
        // 404 gövdesi stratejik hedef şemasını veya izin kodunu sızdırmaz.
        const body = await response.text();
        expect(body).not.toContain('strategic_goal');
      }
    } finally {
      await app.close();
    }
  });
});
