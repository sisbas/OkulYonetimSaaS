import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

import {
  createAdminSeedDataSource,
  queryAdminSeedState,
  wipeSharedUserReferences,
} from './support/first-admin-fixture';

/**
 * #388 — belgelenen operatör komutunun (`npm run db:seed:admin`) uçtan uca kanıtı.
 *
 * admin-user-seed.spec.ts seed fonksiyonunu (seedFirstAdminUser) doğrudan çağırır;
 * bu suite ise README'de document edilen gerçek kurulum akışını child process olarak
 * çalıştırır: önce `npm run db:seed:permissions`, sonra tenant slug override'ı OLMADAN
 * `npm run db:seed:admin` — yani iki komutun paylaştığı default tenant (system-seed)
 * sözleşmesi dahil. Env girdileri, AppDataSource bağlantısı, exit kodları ve
 * stdout/stderr mesajları doğrulanır. DB Smoke (test:database:required) kapsamında
 * gerçek PostgreSQL üzerinde koşar.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = DATABASE_URL ? describe : describe.skip;

const BUILT_IN_DEFAULT_TENANT_SLUG = 'system-seed';
const ADMIN_EMAIL = 'cli-admin@okul.example';
const ADMIN_PASSWORD = 'cli-bootstrap-pass-2026';
const ADMIN_FULL_NAME = 'CLI Kurum Yoneticisi';

function runNpmScript(script: string, extraEnv: Record<string, string> = {}): SpawnSyncReturns<string> {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.SEED_TENANT_SLUG;
  return spawnSync('npm', ['run', script], {
    cwd: `${__dirname}/../..`,
    encoding: 'utf8',
    env: {
      ...childEnv,
      ...extraEnv,
    },
    shell: true,
    timeout: 90_000,
  });
}

function runSeedCli(extraEnv: Record<string, string> = {}): SpawnSyncReturns<string> {
  return runNpmScript('db:seed:admin', {
    SEED_ADMIN_EMAIL: ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
    SEED_ADMIN_FULL_NAME: ADMIN_FULL_NAME,
    ...extraEnv,
  });
}

describeWithPostgres('db:seed:admin CLI on real PostgreSQL (#388)', () => {
  jest.setTimeout(180_000);

  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createAdminSeedDataSource(DATABASE_URL as string);
    const permissionsSeed = runNpmScript('db:seed:permissions');
    expect(permissionsSeed.error).toBeUndefined();
    expect(permissionsSeed.status).toBe(0);
    expect(permissionsSeed.stdout + permissionsSeed.stderr).not.toMatch(/ERR!/);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.transaction((manager) => wipeSharedUserReferences(manager));
  });

  it('creates the first loginable admin via npm run db:seed:admin', async () => {
    const result = runSeedCli();

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/First admin user created/);

    const state = await queryAdminSeedState(dataSource, ADMIN_EMAIL, BUILT_IN_DEFAULT_TENANT_SLUG);
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
