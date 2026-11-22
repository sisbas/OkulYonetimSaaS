'use strict';

/**
 * #503 — create a NEW synthetic administrator on the PREVIEW database only.
 *
 * Safety:
 * - refuses the known production Neon endpoint (case-insensitive, incl. ?host=);
 * - requires an explicit 'preview' confirmation;
 * - refuses to overwrite an existing email;
 * - password comes only from the PREVIEW_ADMIN_PASSWORD secret;
 * - never prints the password or connection string.
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const PRODUCTION_HOST_FRAGMENT = 'ep-orange-sunset-avzlq9ut';
const TENANT_SLUG = 'system-seed';
const ROLE_NAME = 'tenant_admin';

function isProductionHost(connectionString) {
  const parsed = new URL(connectionString);
  const hosts = [parsed.hostname];
  for (const [key, value] of parsed.searchParams) {
    if (key.toLowerCase() === 'host') hosts.push(value);
  }
  return hosts
    .map((value) => String(value ?? '').toLowerCase())
    .some((host) => host.includes(PRODUCTION_HOST_FRAGMENT));
}

async function main() {
  const confirm = String(process.env.PREVIEW_RESET_CONFIRM ?? '').trim().toLowerCase();
  if (confirm !== 'preview') throw new Error('CONFIRM_REQUIRED');

  const email = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const fullName = String(process.env.ADMIN_FULL_NAME ?? 'Önizleme Yöneticisi').trim();
  const password = String(process.env.ADMIN_PASSWORD ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BAD_EMAIL');
  if (fullName.length === 0) throw new Error('BAD_FULL_NAME');
  if (password.length < 12) throw new Error('PASSWORD_TOO_SHORT');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  if (isProductionHost(connectionString)) throw new Error('PRODUCTION_DB_REFUSED');

  const normalized = (value) => String(value ?? '').toLowerCase();
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  });

  // pg treats ?host= as authoritative; check the effective host before connecting.
  if (normalized(client.connectionParameters?.host).includes(PRODUCTION_HOST_FRAGMENT)) {
    throw new Error('PRODUCTION_DB_REFUSED');
  }
  await client.connect();
  try {
    // AuthService.findActiveUserByEmail eşleştirmesi lower(email) ile yapılır;
    // aynı kimliğin büyük/küçük harfli varyantı varsa yeni hesap açmayalım.
    const existing = await client.query(
      'SELECT id::text AS id FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    if (existing.rows.length > 0) throw new Error('USER_EXISTS');

    const tenant = await client.query(
      `SELECT id::text AS id FROM tenants
        WHERE slug = $1 AND status = 'active' AND deleted_at IS NULL`,
      [TENANT_SLUG],
    );
    if (tenant.rows.length === 0) throw new Error('TENANT_NOT_FOUND');
    const tenantId = String(tenant.rows[0].id);

    const role = await client.query(
      `SELECT id::text AS id FROM roles
        WHERE tenant_id = $1::uuid AND name = $2 AND deleted_at IS NULL`,
      [tenantId, ROLE_NAME],
    );
    if (role.rows.length === 0) throw new Error('ROLE_NOT_FOUND');
    const roleId = String(role.rows[0].id);

    const hash = bcrypt.hashSync(password, 10);
    await client.query('BEGIN');
    try {
      const inserted = await client.query(
        `INSERT INTO users (email, credential_hash, full_name, status, token_version)
         VALUES ($1, $2, $3, 'active', 1)
         RETURNING id::text AS id`,
        [email, hash, fullName],
      );
      const userId = String(inserted.rows[0].id);
      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, status)
         VALUES ($1::uuid, $2::uuid, 'active')
         ON CONFLICT (tenant_id, user_id)
         DO UPDATE SET status = 'active', deleted_at = NULL, updated_at = now()`,
        [tenantId, userId],
      );
      await client.query(
        `INSERT INTO user_roles (tenant_id, user_id, role_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid)
         ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
        [tenantId, userId, roleId],
      );
      await client.query('COMMIT');
      console.log(JSON.stringify({
        mode: 'PREVIEW_ADMIN_CREATED',
        outcome: 'created',
        email,
        userId,
        host: normalized(client.connectionParameters?.host),
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

module.exports = { isProductionHost };

if (require.main === module) {
  main().catch((error) => {
    const code = /^(CONFIRM_REQUIRED|BAD_EMAIL|BAD_FULL_NAME|PASSWORD_TOO_SHORT|DATABASE_URL_REQUIRED|PRODUCTION_DB_REFUSED|USER_EXISTS|TENANT_NOT_FOUND|ROLE_NOT_FOUND)$/.test(
      String(error.message),
    ) ? String(error.message) : 'CREATE_FAILED';
    console.error(code);
    process.exitCode = 1;
  });
}
