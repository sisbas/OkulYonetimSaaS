'use strict';

/**
 * #503 — reset the password of an EXISTING preview administrator.
 *
 * Safety:
 * - refuses the known production Neon endpoint (hard-coded host fragment);
 * - requires an explicit 'preview' confirmation input;
 * - never creates a user, never prints the password or connection string;
 * - only updates credential_hash/token_version and reactivates membership/role.
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const PRODUCTION_HOST_FRAGMENT = 'ep-orange-sunset-avzlq9ut';
const TENANT_SLUG = 'system-seed';
const ROLE_NAME = 'tenant_admin';

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '<masked>';
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  const confirm = String(process.env.PREVIEW_RESET_CONFIRM ?? '').trim().toLowerCase();
  if (confirm !== 'preview') throw new Error('CONFIRM_REQUIRED');

  const email = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BAD_EMAIL');
  if (password.length < 12) throw new Error('PASSWORD_TOO_SHORT');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const parsed = new URL(connectionString);
  if (parsed.hostname.includes(PRODUCTION_HOST_FRAGMENT)) throw new Error('PRODUCTION_DB_REFUSED');

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const found = await client.query(
      'SELECT id::text AS id, status FROM users WHERE email = $1',
      [email],
    );
    if (found.rows.length === 0) throw new Error('USER_NOT_FOUND');
    const userId = String(found.rows[0].id);

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
      await client.query(
        `UPDATE users
            SET credential_hash = $2, status = 'active', deleted_at = NULL,
                token_version = token_version + 1, updated_at = now()
          WHERE id = $1::uuid`,
        [userId, hash],
      );
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
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    console.log(JSON.stringify({
      mode: 'PREVIEW_ADMIN_PASSWORD_RESET',
      outcome: 'reset',
      email: maskEmail(email),
      userId,
      host: parsed.hostname,
    }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const code = /^(CONFIRM_REQUIRED|BAD_EMAIL|PASSWORD_TOO_SHORT|DATABASE_URL_REQUIRED|PRODUCTION_DB_REFUSED|USER_NOT_FOUND|TENANT_NOT_FOUND|ROLE_NOT_FOUND)$/.test(
    String(error.message),
  ) ? String(error.message) : 'RESET_FAILED';
  console.error(code);
  process.exitCode = 1;
});
