import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

import {
  AdminSeedError,
  MIN_ADMIN_PASSWORD_LENGTH,
  seedFirstAdminUser,
  validateAdminSeedInput,
} from '../../src/database/seeds/admin-user.seed';
import {
  createAdminSeedDataSource,
  queryAdminSeedState,
  resetAdminSeedFixture,
} from './support/first-admin-fixture';

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

describeWithPostgres('admin user seed on real PostgreSQL (#388)', () => {
  jest.setTimeout(30_000);

  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createAdminSeedDataSource(DATABASE_URL as string);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.transaction((manager) =>
      resetAdminSeedFixture(manager, BASE_INPUT.tenantSlug),
    );
  });

  it('creates the first admin user with active membership and tenant_admin role', async () => {
    const result = await dataSource.transaction((manager) => seedFirstAdminUser(manager, BASE_INPUT));

    expect(result.outcome).toBe('created');

    const state = await queryAdminSeedState(dataSource, BASE_INPUT.email, BASE_INPUT.tenantSlug);
    expect(state.user).not.toBeNull();
    expect(state.user?.full_name).toBe(BASE_INPUT.fullName);
    expect(state.user?.status).toBe('active');
    expect(state.user?.token_version).toBe(1);
    expect(bcrypt.compareSync(BASE_INPUT.password, state.user?.credential_hash ?? '')).toBe(true);
    expect(state.membershipStatus).toBe('active');
    expect(state.roleNames).toEqual(['tenant_admin']);
    expect(state.user?.id).toBe(result.userId);
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
