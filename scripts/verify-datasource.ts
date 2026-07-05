import { AppDataSource } from '../src/database/data-source';

const CORE_TABLES = ['tenants', 'branches', 'users', 'roles', 'permissions', 'audit_logs', 'kvkk_consents'];

export async function verifyDataSource(): Promise<void> {
  const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();
  try {
    console.log('DataSource initialized');
    await ds.query('SELECT 1');
    console.log('Database connection OK');
    await ds.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, ['migrations']);
    console.log('Migration metadata OK');
    const rows: Array<{ table_name: string }> = await ds.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [CORE_TABLES],
    );
    const present = new Set(rows.map((row) => row.table_name));
    const missing = CORE_TABLES.filter((table) => !present.has(table));
    if (missing.length > 0) throw new Error(`Missing core tables: ${missing.join(', ')}`);
    console.log('Core tables OK');
    console.log('DataSource verification passed');
  } catch (error) {
    throw new Error(`DataSource verification failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (ds.isInitialized) await ds.destroy();
  }
}

if (require.main === module) {
  verifyDataSource().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
