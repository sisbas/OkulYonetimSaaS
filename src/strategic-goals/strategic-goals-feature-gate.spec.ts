import { Test } from '@nestjs/testing';

import { buildFeatureModules } from '../app.module';

/**
 * #482 — Kapı kapalıyken HTTP yüzeyi.
 *
 * Gerçek AppModule + PostgreSQL kanıtı `test/database/strategic-goals-flag.spec.ts`
 * içinde (CI DB Smoke). Bu spec DB'siz ortamda da kapının HTTP sonucunu
 * doğrular: kaydedilmeyen modül → route yok → 404. Kimlik doğrulaması
 * olmadığı için 401/403 dönseydi yüzeyin varlığı sızardı; burada 404 beklenir.
 */
describe('#482 strategic goals disabled surface (HTTP)', () => {
  it('answers 404 when the feature modules list is empty', async () => {
    const modules = buildFeatureModules({});
    expect(modules).toEqual([]);

    const moduleRef = await Test.createTestingModule({ imports: modules }).compile();
    const app = moduleRef.createNestApplication();
    try {
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      const baseUrl = await app.getUrl();
      for (const [method, path] of [
        ['GET', '/api/v1/strategic-goals'],
        ['POST', '/api/v1/strategic-goals'],
        ['DELETE', '/api/v1/strategic-goals/11111111-1111-4111-8111-111111111111'],
      ] as const) {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
          headers: { 'content-type': 'application/json' },
        });
        expect({ method, path, status: response.status }).toEqual({ method, path, status: 404 });
        expect(await response.text()).not.toContain('strategic_goal');
      }
    } finally {
      await app.close();
    }
  });
});
