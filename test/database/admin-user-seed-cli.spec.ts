import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

import {
  createAdminSeedDataSource,
  queryAdminSeedState,
  resetAdminSeedFixture,
} from './support/first-admin-fixture';

/**
 * #388 — belgelenen operatör komutunun (`npm run db:seed:admin`) uçtan uca kanıtı.
 *
 * admin-user-seed.spec.ts seed fonksiyonunu (seedFirstAdminUser) doğrudan çağırır;
 * bu suite ise README'de document edilen CLI yolunu gerçek child process olarak
 * çalıştırır: env girdileri, AppDataSource bağlantısı, exit kodları ve stdout/stderr
 * mesajları dahil. DB Smoke (test:database:required) kapsamında gerçek PostgreSQL
 * üzerinde koşar.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const TENANT_SLUG = 'admin-cli-tenant';
const ADMIN_EMAIL = 'cli-admin@okul.example';
const ADMIN_PASSWORD = 'cli-bootstrap-pass-2026';
const ADMIN_FULL_NAME = 'CLI Kurum Yoneticisi';

function runSeedCli(extraEnv: Record<string, string> = {}): SpawnSyncReturns<string> {
  return spawnSync('npm', ['run', 'db:seed:admin'], {
    cwd: `${__dirname}/../..`,
    encoding: 'utf8',
    env: {
      ...process.env,
      SEED_TENANT_SLUG: TENANT_SLUG,
      SEED_ADMIN_EMAIL: ADMIN_EMAIL,
      SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
      SEED_ADMIN_FULL_NAME: ADMIN_FULL_NAME,
      ...extraEnv,
    },
    shell: true,
    timeout: 90_000,
  });
}

describeWithPostgres('db:seed:admin CLI on real PostgreSQL (#388)', () => {
  jest.setTimeout(120_000);

  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createAdminSeedDataSource(DATABASE_URL as string);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.transaction((manager) => resetAdminSeedFixture(manager, TENANT_SLUG));
  });

  it('creates the first loginable admin via npm run db:seed:admin', async () => {
    const result = runSeedCli();

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/First admin user created/);

    const state = await queryAdminSeedState(dataSource, ADMIN_EMAIL, TENANT_SLUG);
    expect(state.user).not.toBeNull();
    expect(state.user?.full_name).toBe(ADMIN_FULL_NAME);
    expect(state.user?.status).toBe('active');
    expect(state.user?.token_version).toBe(1);
    expect(bcrypt.compareSync(ADMIN_PASSWORD, state.user?.credential_hash ?? '')).toBe(true);
    expect(state.membershipStatus).toBe('active');
    expect(state.roleNames).toEqual(['tenant_admin']);
  });

  it('exits 0 with already exists on a re-run and keeps a single row', async () => {
    const first = runSeedCli();
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(/First admin user created/);

    const second = runSeedCli();
    expect(second.error).toBeUndefined();
    expect(second.status).toBe(0);
    expect(second.stdout).toMatch(/already exists/);

    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users`);
    expect(countRows[0].n).toBe(1);
  });

  it('fails closed with exit code 1 when users already exist for another email', async () => {
    const first = runSeedCli();
    expect(first.status).toBe(0);

    const second = runSeedCli({ SEED_ADMIN_EMAIL: 'other-admin@okul.example' });
    expect(second.error).toBeUndefined();
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/first-user bootstrap only/);

    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users`);
    expect(countRows[0].n).toBe(1);
  });

  it('rejects a weak password with exit code 1 before creating any row', async () => {
    const result = runSeedCli({ SEED_ADMIN_PASSWORD: 'short' });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/at least 12/);

    const countRows = await dataSource.query(`SELECT count(*)::int AS n FROM users`);
    expect(countRows[0].n).toBe(0);
  });
});
