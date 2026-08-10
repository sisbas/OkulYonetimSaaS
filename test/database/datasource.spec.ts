import { AppDataSource, getDatabaseUrl } from '../../src/database/data-source';

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
});
