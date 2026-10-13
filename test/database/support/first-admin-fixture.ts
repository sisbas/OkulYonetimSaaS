import { DataSource, EntityManager } from 'typeorm';

import { CreateRolesPermissions1700000000007 } from '../../../src/database/migrations/1700000000007-CreateRolesPermissions';
import { CreateTenantMemberships1700000000006 } from '../../../src/database/migrations/1700000000006-CreateTenantMemberships';
import { CreateTenants1700000000002 } from '../../../src/database/migrations/1700000000002-CreateTenants';
import { CreateUsers1700000000005 } from '../../../src/database/migrations/1700000000005-CreateUsers';

async function runIfTableExists(
  manager: EntityManager,
  table: string,
  sql: string,
): Promise<void> {
  const rows: Array<{ ok: boolean }> = await manager.query(
    `SELECT to_regclass(current_schema() || '.' || $1) IS NOT NULL AS ok`,
    [table],
  );
  if (rows[0].ok) await manager.query(sql);
}

async function wipeSharedUserReferences(manager: EntityManager): Promise<void> {
  await runIfTableExists(
    manager,
    'audit_logs',
    `UPDATE audit_logs
        SET actor_user_id = NULL, actor_session_id = NULL
      WHERE actor_user_id IS NOT NULL OR actor_session_id IS NOT NULL`,
  );
  await runIfTableExists(
    manager,
    'kvkk_consent_events',
    `UPDATE kvkk_consent_events SET actor_user_id = NULL WHERE actor_user_id IS NOT NULL`,
  );
  await runIfTableExists(
    manager,
    'teachers',
    `UPDATE teachers SET user_id = NULL WHERE user_id IS NOT NULL`,
  );
  await runIfTableExists(manager, 'user_sessions', `DELETE FROM user_sessions`);
  await manager.query(`DELETE FROM user_roles`);
  await manager.query(`DELETE FROM tenant_memberships`);
  await manager.query(`DELETE FROM users`);
}

async function recreateTenantWithAdminRole(
  manager: EntityManager,
  tenantSlug: string,
): Promise<void> {
  await manager.query(
    `DELETE FROM roles WHERE tenant_id IN (SELECT id FROM tenants WHERE slug = $1)`,
    [tenantSlug],
  );
  await manager.query(`DELETE FROM tenants WHERE slug = $1`, [tenantSlug]);
  await manager.query(`INSERT INTO tenants (name, slug) VALUES ('Admin Seed Tenant', $1)`, [
    tenantSlug,
  ]);
  await manager.query(
    `INSERT INTO roles (tenant_id, name, description, is_system_role)
     SELECT id, 'tenant_admin', 'tenant_admin default role', true FROM tenants WHERE slug = $1`,
    [tenantSlug],
  );
}

export async function resetAdminSeedFixture(
  manager: EntityManager,
  tenantSlug: string,
): Promise<void> {
  await wipeSharedUserReferences(manager);
  await recreateTenantWithAdminRole(manager, tenantSlug);
}

export async function createAdminSeedDataSource(databaseUrl: string): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  try {
    await new CreateTenants1700000000002().up(runner);
    await new CreateUsers1700000000005().up(runner);
    await new CreateTenantMemberships1700000000006().up(runner);
    await new CreateRolesPermissions1700000000007().up(runner);
  } finally {
    await runner.release();
  }
  return dataSource;
}

export type AdminSeedState = Readonly<{
  user: {
    id: string;
    email: string;
    credential_hash: string;
    full_name: string;
    status: string;
    token_version: number;
  } | null;
  membershipStatus: string | null;
  roleNames: string[];
}>;

export async function queryAdminSeedState(
  dataSource: DataSource,
  email: string,
  tenantSlug: string,
): Promise<AdminSeedState> {
  const userRows = await dataSource.query(
    `SELECT id::text AS id, email, credential_hash, full_name, status, token_version
     FROM users WHERE email = $1`,
    [email],
  );
  const user = userRows[0] ?? null;
  if (!user) {
    return Object.freeze({ user: null, membershipStatus: null, roleNames: [] });
  }
  const membershipRows = await dataSource.query(
    `SELECT status FROM tenant_memberships
     WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1) AND user_id = $2::uuid`,
    [tenantSlug, user.id],
  );
  const roleRows = await dataSource.query(
    `SELECT r.name FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1::uuid AND r.name = 'tenant_admin'`,
    [user.id],
  );
  return Object.freeze({
    user,
    membershipStatus: membershipRows[0]?.status ?? null,
    roleNames: roleRows.map((row: { name: string }) => row.name),
  });
}
