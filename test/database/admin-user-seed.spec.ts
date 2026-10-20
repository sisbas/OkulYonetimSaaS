import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';

import { CreateRolesPermissions1700000000007 } from '../../src/database/migrations/1700000000007-CreateRolesPermissions';
import { CreateTenantMemberships1700000000006 } from '../../src/database/migrations/1700000000006-CreateTenantMemberships';
import { CreateTenants1700000000002 } from '../../src/database/migrations/1700000000002-CreateTenants';
import { CreateUsers1700000000005 } from '../../src/database/migrations/1700000000005-CreateUsers';
import {
  AdminSeedError,
  ExistingAccountState,
  MIN_ADMIN_PASSWORD_LENGTH,
  decideExistingAccount,
  seedFirstAdminUser,
  validateAdminSeedInput,
} from '../../src/database/seeds/admin-user.seed';

/**
 * #388 K-11 — ilk kullanıcı bootstrap seed kanıtı.
 *
 * Saf validasyon testleri veritabanı olmadan koşar; seed mantığı GERÇEK
 * PostgreSQL üzerinde kanıtlanır (describeWithPostgres, repo konvansiyonu).
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const BASE_INPUT = Object.freeze({
  tenantSlug: 'admin-seed-tenant',
  email: 'admin@okul.example',
  password: 'bootstrap-pass-2026',
  fullName: 'Kurum Yöneticisi',
});

describe('validateAdminSeedInput (#388)', () => {
  it('rejects blank email', () => {
    expect(() => validateAdminSeedInput({ ...BASE_INPUT, email: '   ' })).toThrow(AdminSeedError);
  });

  it('rejects malformed email', () => {
    expect(() => validateAdminSeedInput({ ...BASE_INPUT, email: 'not-an-email' })).toThrow(AdminSeedError);
  });

  it(`rejects password shorter than ${MIN_ADMIN_PASSWORD_LENGTH} characters`, () => {
    expect(() => validateAdminSeedInput({ ...BASE_INPUT, password: 'short' })).toThrow(AdminSeedError);
  });

  it('rejects blank fullName', () => {
    expect(() => validateAdminSeedInput({ ...BASE_INPUT, fullName: '  ' })).toThrow(AdminSeedError);
  });

  it('rejects blank tenantSlug', () => {
    expect(() => validateAdminSeedInput({ ...BASE_INPUT, tenantSlug: '' })).toThrow(AdminSeedError);
  });

  it('accepts a valid input', () => {
    expect(() => validateAdminSeedInput(BASE_INPUT)).not.toThrow();
  });
});

describe('decideExistingAccount (#465)', () => {
  const LOGINABLE: ExistingAccountState = Object.freeze({
    userSoftDeleted: false,
    userStatus: 'active',
    membership: Object.freeze({ status: 'active', softDeleted: false }),
    hasRole: true,
  });

  it('returns already-exists only when every auth predicate holds', () => {
    expect(decideExistingAccount(LOGINABLE)).toBe('already-exists');
  });

  it('repairs a soft-deleted user even when its status still says active', () => {
    expect(decideExistingAccount({ ...LOGINABLE, userSoftDeleted: true })).toBe('repair-user');
  });

  it('repairs a soft-deleted tenant membership', () => {
    expect(
      decideExistingAccount({
        ...LOGINABLE,
        membership: { status: 'active', softDeleted: true },
      }),
    ).toBe('repair-membership');
  });

  it('repairs the user, which also restores the membership, when both are soft-deleted', () => {
    expect(
      decideExistingAccount({
        ...LOGINABLE,
        userSoftDeleted: true,
        membership: { status: 'active', softDeleted: true },
      }),
    ).toBe('repair-user');
  });

  it('fails closed for an inactive user', () => {
    expect(decideExistingAccount({ ...LOGINABLE, userStatus: 'inactive' })).toBe('not-loginable');
  });

  it('fails closed for an inactive tenant membership', () => {
    expect(
      decideExistingAccount({
        ...LOGINABLE,
        membership: { status: 'inactive', softDeleted: false },
      }),
    ).toBe('not-loginable');
  });

  it('fails closed when the membership row is missing', () => {
    expect(decideExistingAccount({ ...LOGINABLE, membership: null })).toBe('not-loginable');
  });

  it('fails closed when the tenant_admin role is missing', () => {
    expect(decideExistingAccount({ ...LOGINABLE, hasRole: false })).toBe('not-loginable');
  });
});

describeWithPostgres('admin user seed on real PostgreSQL (#388)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL as string,
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  // beforeAll yalnızca 4 çekirdek tablo yaratır; paylaşımlı CI veritabanında
  // tam şema vardır, kısmi şemada ise bu yardımcı tablolar atlanır.
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

  async function expectLoginable(userId: string): Promise<void> {
    const rows: Array<{ ok: boolean }> = await dataSource.query(
      `SELECT (
         (SELECT status FROM users WHERE id = $1::uuid) = 'active'
         AND (SELECT deleted_at FROM users WHERE id = $1::uuid) IS NULL
         AND EXISTS (
           SELECT 1 FROM tenant_memberships
           WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $2)
             AND user_id = $1::uuid AND status = 'active' AND deleted_at IS NULL
         )
         AND EXISTS (
           SELECT 1 FROM tenants
           WHERE id = (SELECT id FROM tenants WHERE slug = $2)
             AND status = 'active' AND deleted_at IS NULL
         )
         AND EXISTS (
           SELECT 1 FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.tenant_id = (SELECT id FROM tenants WHERE slug = $2)
             AND ur.user_id = $1::uuid AND r.deleted_at IS NULL
         )
       ) AS ok`,
      [userId, BASE_INPUT.tenantSlug],
    );
    expect(rows[0].ok).toBe(true);
  }

  beforeEach(async () => {
    await dataSource.transaction(async (manager) => {
      // test/database suite'leri aynı CI veritabanında sırayla koşar; önceki
      // suite'lerin (ör. attendance/leave/schedule fixture'ları) bıraktığı
      // kullanıcı referansları global kullanıcı wipe'ını FK ile kırar.
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
      // Fail-closed ilk-kullanıcı semantiği tüm users tablosunu boş ister.
      await manager.query(`DELETE FROM users`);
      // Tenant/rol yaşam döngüsü kendi slug'ıyla sınırlıdır: paylaşımlı CI
      // veritabanındaki diğer suite verilerine (branches/outbox/audit vb.) dokunulmaz.
      await manager.query(
        `DELETE FROM roles WHERE tenant_id IN (SELECT id FROM tenants WHERE slug = $1)`,
        [BASE_INPUT.tenantSlug],
      );
      await manager.query(`DELETE FROM tenants WHERE slug = $1`, [BASE_INPUT.tenantSlug]);
      await manager.query(`INSERT INTO tenants (name, slug) VALUES ('Admin Seed Tenant', $1)`, [
        BASE_INPUT.tenantSlug,
      ]);
      await manager.query(
        `INSERT INTO roles (tenant_id, name, description, is_system_role)
         SELECT id, 'tenant_admin', 'tenant_admin default role', true FROM tenants WHERE slug = $1`,
        [BASE_INPUT.tenantSlug],
      );
    });
  });

  it('creates the first admin user with active membership and tenant_admin role', async () => {
    const result = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));

    expect(result.outcome).toBe('created');

    const userRows = await dataSource.query(
      `SELECT id::text AS id, email, credential_hash, full_name, status, token_version
       FROM users WHERE email = $1`,
      [BASE_INPUT.email],
    );
    expect(userRows).toHaveLength(1);
    expect(userRows[0].full_name).toBe(BASE_INPUT.fullName);
    expect(userRows[0].status).toBe('active');
    expect(userRows[0].token_version).toBe(1);
    expect(bcrypt.compareSync(BASE_INPUT.password, userRows[0].credential_hash)).toBe(true);

    const userId = userRows[0].id;
    const membershipRows = await dataSource.query(
      `SELECT status FROM tenant_memberships WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1) AND user_id = $2::uuid`,
      [BASE_INPUT.tenantSlug, userId],
    );
    expect(membershipRows).toHaveLength(1);
    expect(membershipRows[0].status).toBe('active');

    const roleRows = await dataSource.query(
      `SELECT r.name FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1::uuid AND r.name = 'tenant_admin'`,
      [userId],
    );
    expect(roleRows).toHaveLength(1);

    expect(result.userId).toBe(userId);
  });

  it('is idempotent: re-run with the same email returns already-exists without a second row', async () => {
    const first = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));
    const second = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('already-exists');
    expect(second.userId).toBe(first.userId);

    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users WHERE email = $1`, [
      BASE_INPUT.email,
    ]);
    expect(countRows[0].n).toBe(1);
  });

  it('normalizes email case: re-run with different case still returns already-exists', async () => {
    const first = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));
    const second = await dataSource.transaction((manager) =>
      seedFirstAdminUser(manager, { ...BASE_INPUT, email: 'ADMIN@OKUL.EXAMPLE' }),
    );

    expect(second.outcome).toBe('already-exists');
    expect(second.userId).toBe(first.userId);

    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users`);
    expect(countRows[0].n).toBe(1);
  });

  it('fails closed when the existing user is not loginable (inactive status)', async () => {
    await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));
    await dataSource.query(`UPDATE users SET status = 'inactive' WHERE email = $1`, [BASE_INPUT.email]);

    await expect(
      dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT)),
    ).rejects.toThrow(/not loginable/);
  });

  it('repairs a soft-deleted admin and issues credentials that can log in (#465)', async () => {
    const first = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));
    await dataSource.query(`UPDATE users SET deleted_at = now() WHERE id = $1::uuid`, [first.userId]);

    const recovery = { ...BASE_INPUT, password: 'recovered-pass-2026' };
    const repaired = await dataSource.transaction((manager) => seedFirstAdminUser(manager, recovery));

    expect(repaired.outcome).toBe('repaired');
    expect(repaired.userId).toBe(first.userId);

    const rows = await dataSource.query(
      `SELECT status, deleted_at, credential_hash, token_version FROM users WHERE id = $1::uuid`,
      [first.userId],
    );
    expect(rows[0].status).toBe('active');
    expect(rows[0].deleted_at).toBeNull();
    expect(bcrypt.compareSync(recovery.password, rows[0].credential_hash)).toBe(true);
    expect(rows[0].token_version).toBe(2);

    await expectLoginable(first.userId);
    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users`);
    expect(countRows[0].n).toBe(1);
  });

  it('repairs a soft-deleted tenant membership without resetting credentials (#465)', async () => {
    const first = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));
    const before = await dataSource.query(`SELECT credential_hash FROM users WHERE id = $1::uuid`, [
      first.userId,
    ]);

    await dataSource.query(
      `UPDATE tenant_memberships SET deleted_at = now()
        WHERE user_id = $1::uuid AND tenant_id = (SELECT id FROM tenants WHERE slug = $2)`,
      [first.userId, BASE_INPUT.tenantSlug],
    );

    const repaired = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));

    expect(repaired.outcome).toBe('repaired');
    expect(repaired.userId).toBe(first.userId);

    const after = await dataSource.query(`SELECT credential_hash FROM users WHERE id = $1::uuid`, [
      first.userId,
    ]);
    expect(after[0].credential_hash).toBe(before[0].credential_hash);
    expect(bcrypt.compareSync(BASE_INPUT.password, after[0].credential_hash)).toBe(true);

    await expectLoginable(first.userId);
  });

  it('repairs a user whose user and membership rows are both soft-deleted (#465)', async () => {
    const first = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));
    await dataSource.query(`UPDATE users SET deleted_at = now() WHERE id = $1::uuid`, [first.userId]);
    await dataSource.query(
      `UPDATE tenant_memberships SET deleted_at = now()
        WHERE user_id = $1::uuid AND tenant_id = (SELECT id FROM tenants WHERE slug = $2)`,
      [first.userId, BASE_INPUT.tenantSlug],
    );

    const repaired = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));

    expect(repaired.outcome).toBe('repaired');
    expect(repaired.userId).toBe(first.userId);

    const membershipRows = await dataSource.query(
      `SELECT status, deleted_at FROM tenant_memberships
        WHERE user_id = $1::uuid AND tenant_id = (SELECT id FROM tenants WHERE slug = $2)`,
      [first.userId, BASE_INPUT.tenantSlug],
    );
    expect(membershipRows).toHaveLength(1);
    expect(membershipRows[0].status).toBe('active');
    expect(membershipRows[0].deleted_at).toBeNull();

    await expectLoginable(first.userId);
  });

  it('fails closed when the existing account has no tenant_admin role (#465)', async () => {
    const first = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));
    await dataSource.query(`DELETE FROM user_roles WHERE user_id = $1::uuid`, [first.userId]);

    await expect(
      dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT)),
    ).rejects.toThrow(/not loginable/);
  });

  it('fails closed when users already exist for a different email', async () => {
    await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));

    await expect(
      dataSource.transaction((manager) =>
        seedFirstAdminUser(manager, { ...BASE_INPUT, email: 'second@okul.example' }),
      ),
    ).rejects.toThrow(AdminSeedError);

    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users`);
    expect(countRows[0].n).toBe(1);
  });

  it('fails closed when the tenant is missing', async () => {
    await dataSource.query(
      `DELETE FROM roles WHERE tenant_id IN (SELECT id FROM tenants WHERE slug = $1)`,
      [BASE_INPUT.tenantSlug],
    );
    await dataSource.query(`DELETE FROM tenants WHERE slug = $1`, [BASE_INPUT.tenantSlug]);

    await expect(
      dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT)),
    ).rejects.toThrow(/db:seed:permissions/);
  });

  it('fails closed when the tenant_admin role is missing', async () => {
    await dataSource.query(
      `DELETE FROM roles
        WHERE name = 'tenant_admin'
          AND tenant_id IN (SELECT id FROM tenants WHERE slug = $1)`,
      [BASE_INPUT.tenantSlug],
    );

    await expect(
      dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT)),
    ).rejects.toThrow(/db:seed:permissions/);
  });

  it('rejects a weak password before touching the database', async () => {
    await expect(
      dataSource.transaction((manager) => seedFirstAdminUser(manager, { ...BASE_INPUT, password: 'short' })),
    ).rejects.toThrow(AdminSeedError);

    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users`);
    expect(countRows[0].n).toBe(0);
  });
});
