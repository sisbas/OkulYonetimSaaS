import { AppDataSource } from '../../src/database/data-source';

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL || process.env.DATABASE_HOST || process.env.TEST_DATABASE_URL);
const describeIfDb = hasDatabaseConfig ? describe : describe.skip;

const CORE_TABLES = [
  'tenants',
  'branches',
  'tenant_settings',
  'users',
  'tenant_memberships',
  'roles',
  'permissions',
  'user_roles',
  'user_sessions',
  'audit_logs',
  'kvkk_consents',
];

describeIfDb('migrations', () => {
  afterEach(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('has migration metadata and all Sprint 0 core tables', async () => {
    const ds = await AppDataSource.initialize();
    const metadataRows = await ds.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, ['migrations']);
    expect(metadataRows).toHaveLength(1);

    const rows: Array<{ table_name: string }> = await ds.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [CORE_TABLES],
    );
    expect(new Set(rows.map((row) => row.table_name))).toEqual(new Set(CORE_TABLES));
  });
});
