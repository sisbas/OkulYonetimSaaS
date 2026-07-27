import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns backend API health metadata without PII', () => {
    const controller = new HealthController();

    const result = controller.check();

    expect(result).toMatchObject({
      status: 'ok',
      service: 'okul-yonetim-saas-api',
      applicationType: 'backend-api',
      databaseRequired: true,
    });
    expect(typeof result.timestamp).toBe('string');
    expect(Number.isInteger(result.uptimeSeconds)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/email|phone|token|password|credential/i);
  });
});
