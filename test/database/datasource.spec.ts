import { AppDataSource, getDatabaseUrl } from '../../src/database/data-source';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReportsService } from '../../src/reports/reports.service';
import { EokulSyncService } from '../../src/eokul-sync/eokul-sync.service';

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);
const describeIfDb = hasDatabaseConfig ? describe : describe.skip;
const originalEnv = {
  databaseUrl: process.env.DATABASE_URL,
  nodeEnv: process.env.NODE_ENV,
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
};

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('database URL resolver', () => {
  afterEach(() => {
    restoreEnvValue('DATABASE_URL', originalEnv.databaseUrl);
    restoreEnvValue('NODE_ENV', originalEnv.nodeEnv);
    restoreEnvValue('TEST_DATABASE_URL', originalEnv.testDatabaseUrl);
  });

  it('uses TEST_DATABASE_URL only during test execution', () => {
    process.env.DATABASE_URL = 'postgres://prod-db';
    process.env.TEST_DATABASE_URL = 'postgres://test-db';

    process.env.NODE_ENV = 'production';
    expect(getDatabaseUrl()).toBe('postgres://prod-db');

    process.env.NODE_ENV = 'test';
    expect(getDatabaseUrl()).toBe('postgres://test-db');
  });
});

describeIfDb('DataSource', () => {
  afterEach(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('initializes, queries, reads metadata, sees core tables, and closes', async () => {
    const ds = await AppDataSource.initialize();
    expect(ds.isInitialized).toBe(true);
    await expect(ds.query('SELECT 1')).resolves.toBeDefined();
    await expect(ds.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, ['migrations'])).resolves.toBeDefined();
    const tables = ['tenants', 'branches', 'tenant_settings', 'users', 'tenant_memberships', 'roles', 'permissions', 'user_roles', 'user_sessions', 'audit_logs', 'kvkk_consents'];
    const rows: Array<{ table_name: string }> = await ds.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [tables],
    );
    expect(new Set(rows.map((row) => row.table_name))).toEqual(new Set(tables));
    await ds.destroy();
    expect(ds.isInitialized).toBe(false);
  });

  it('boots the public API with PostgreSQL and default-OFF report/eokul quarantine (#268)', async () => {
    const flags = ['ENABLE_REPORTS', 'ENABLE_EOKUL_SYNC', 'SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK'];
    const previous = flags.map((name) => process.env[name]);
    flags.forEach((name) => delete process.env[name]);
    process.env.SECURITY_CONTEXT_ALLOW_SESSION_FALLBACK = 'false';
    // Import after removing flags: AppModule evaluates its release gates at load time.
    const { AppModule } = await import('../../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    try {
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      const baseUrl = await app.getUrl();
      const ds = app.get(DataSource);
      expect(ds.isInitialized).toBe(true);
      expect(ds.options.type).toBe('postgres');
      await expect(ds.query('SELECT current_database()')).resolves.toHaveLength(1);
      expect(() => app.get(ReportsService)).toThrow();
      expect(() => app.get(EokulSyncService)).toThrow();
      expect((await fetch(`${baseUrl}/api/v1/health`)).status).toBe(200);
      for (const surface of ['reports', 'reports/export', 'reports/generate', 'eokul-sync', 'eokul-sync/runs', 'eokul-sync/sync']) {
        for (const method of ['get', 'post'] as const) {
          const response = await fetch(`${baseUrl}/api/v1/${surface}?tenantId=other-tenant&formula=%3Dformula`, {
            method: method.toUpperCase(), headers: { 'x-tenant-id': 'other-tenant' },
          });
          expect(response.status).toBe(404);
          expect(response.headers.get('content-disposition')).toBeNull();
          const body = await response.json();
          expect(body).not.toHaveProperty('resultJson');
          expect(body).not.toHaveProperty('recordsUpserted');
        }
      }
    } finally {
      await app.close();
      flags.forEach((name, index) => restoreEnvValue(name, previous[index]));
    }
  }, 60000);
});
