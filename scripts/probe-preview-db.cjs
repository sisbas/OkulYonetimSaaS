'use strict';

/**
 * #503 — read-only probe of the configured preview database.
 * Emits metadata and row COUNTS only. No row values, emails, tenant names or
 * connection strings are printed or written to artifacts.
 */
const { Client } = require('pg');

const TABLES = ['users', 'tenants', 'branches', 'schedules', 'migrations'];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const parsed = new URL(connectionString);
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const meta = await client.query('SELECT current_database() AS database, current_user AS role, version() AS version');
    const row = meta.rows[0] ?? {};
    const counts = {};
    for (const table of TABLES) {
      try {
        const result = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
        counts[table] = Number(result.rows[0]?.n ?? -1);
      } catch (error) {
        counts[table] = `unavailable:${String(error.code ?? 'ERROR').slice(0, 40)}`;
      }
    }
    console.log(JSON.stringify({
      mode: 'READ_ONLY_PREVIEW_DB_PROBE',
      host: parsed.hostname,
      database: row.database ?? null,
      role: row.role ?? null,
      postgresVersion: String(row.version ?? '').split(',')[0],
      counts,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('PREVIEW_DB_PROBE_FAILED', String(error.message ?? error).slice(0, 200));
  process.exitCode = 1;
});
