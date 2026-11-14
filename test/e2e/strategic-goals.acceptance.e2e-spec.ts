import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { createUiSession, launchE2eBrowser, type UiSession } from './support/browser';
import { readE2eEnvironment, type E2eEnvironment } from './support/env';
import { createPgClient, type PgClient } from './support/pg-client';
import {
  describeFixtureError,
  seedReferenceFixtures,
  type ReferenceFixture,
} from './support/reference-fixtures';
import { startRuntimeServer, type RuntimeServer } from './support/runtime-server';

/**
 * #484 — Stratejik hedefler P0 tarayıcı yolculuğu.
 *
 * Kanıtlanan sözleşme:
 * - Yönetici (stratejik_goal:manage) hedef ekler, gerçekleşme girer ve hedefi
 *   siler; her adım yalnız görünür UI kontrolleriyle yapılır.
 * - Öğretmen (stratejik_goal:read) aynı okulun hedeflerini görür; yazma kontrolü
 *   DOM'da bulunmaz.
 * - Deploy bayrağı (STRATEGIC_GOALS_ENABLED) kapalıyken yüzey hiç açılmaz ve
 *   /strategic-goals rotası 404 döner (varlık sızmaz).
 * - İş sonucu satırları yalnız UI üretir; spec yalnız SALT-OKUNUR kanıt okur.
 */

jest.setTimeout(900_000);

const NAMESPACE = 'stratgoals';
const METRIC_KEY = 'devam_orani';
const METRIC_LABEL = 'Devam oranı';
const TARGET_VALUE = '95';
const PROGRESS_VALUE = '93';

let environment: E2eEnvironment;
let fixture: ReferenceFixture;
let server: RuntimeServer | undefined;
let browser: Browser | undefined;
let adminSession: UiSession | undefined;
let teacherSession: UiSession | undefined;
let dbClient: PgClient | undefined;
const screenshotIndex = { value: 0 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginViaUi(session: UiSession, email: string, credential: string): Promise<void> {
  await session.navigateToRuntime();
  await session.typeInto('#email', email);
  await session.typeInto('#password', credential);
  const armed = session.armResponse('/api/v1/auth/login', 'POST');
  await session.submitForm('#login-form');
  const status = await armed;
  if (status < 200 || status >= 300) throw new Error(`Login failed with HTTP ${status}.`);
  await session.waitForText('#session-status', /Oturum aktif/i, 20_000);
}

/** API üzerinden giriş: bayrak kapalı koşuda 404 kanıtı için (okuma amaçlı). */
async function loginForApi(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`API login failed with HTTP ${response.status}.`);
  const body = (await response.json()) as { accessToken?: string };
  return body.accessToken ?? '';
}

/** Sekme, sunucu kataloğu (izinler) geldikten sonra görünür olur. */
async function waitForTab(session: UiSession, tab: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.isVisible(`.tab[data-tab="${tab}"]`)) return;
    await sleep(250);
  }
  throw new Error(`Sekme görünür olmadı: ${tab}`);
}

async function openStrategicGoals(session: UiSession): Promise<void> {
  await waitForTab(session, 'yonetim');
  await session.clickElement('.tab[data-tab="yonetim"]');
  await session.waitForText('#strategic-goals-heading', /Stratejik hedefler ve gerçekleşme/i, 20_000);
}

/** Seçili akademik yılı DOM'dan okur (salt-okunur). */
async function readSelectedYear(session: UiSession): Promise<string> {
  return session.page
    .$eval('#strategic-goals-year', (element) => (element as HTMLSelectElement).value)
    .catch(() => '');
}

async function readGoalRows(client: PgClient, tenantId: string, metricKey: string) {
  const result = await client.query(
    `SELECT id::text AS id, academic_year, metric_key, metric_label, target_value,
            progress_value, deleted_at
       FROM strategic_goals
      WHERE tenant_id = $1::uuid AND metric_key = $2
      ORDER BY created_at ASC`,
    [tenantId, metricKey],
  );
  return result.rows;
}

describe('#484 Stratejik hedefler P0 yolculuğu (bayrak açık ve kapalı)', () => {
  beforeAll(async () => {
    environment = readE2eEnvironment();
    server = await startRuntimeServer({
      baseUrl: environment.baseUrl,
      port: environment.port,
      artifactDir: environment.artifactDir,
      env: { STRATEGIC_GOALS_ENABLED: 'true' },
    });
    dbClient = createPgClient(environment.databaseUrl);
    await dbClient.connect();
    try {
      fixture = await seedReferenceFixtures(dbClient, {
        tenantSlug: environment.seedTenantSlug,
        credential: environment.fixtureCredential,
        namespace: NAMESPACE,
      });
    } catch (error) {
      throw new Error(`Referans fixture kurulamadı: ${describeFixtureError(error)}`);
    }
    browser = await launchE2eBrowser();
    adminSession = await createUiSession({
      browser,
      baseUrl: environment.baseUrl,
      screenshotDir: path.join(environment.artifactDir, 'strategic-goals'),
      index: screenshotIndex,
    });
    teacherSession = await createUiSession({
      browser,
      baseUrl: environment.baseUrl,
      screenshotDir: path.join(environment.artifactDir, 'strategic-goals'),
      index: screenshotIndex,
    });
  });

  afterAll(async () => {
    await adminSession?.close();
    await teacherSession?.close();
    await browser?.close();
    await dbClient?.end();
    await server?.stop();
  });

  it('yönetici hedef ekler, gerçekleşme girer ve hedefi siler (yalnız UI aksiyonları)', async () => {
    await loginViaUi(adminSession!, fixture.adminUser.email, fixture.adminUser.credential);
    await openStrategicGoals(adminSession!);

    const year = await readSelectedYear(adminSession!);
    expect(year).toMatch(/^\d{4}-\d{4}$/);

    await adminSession!.clickElement('#strategic-goals-add');
    await adminSession!.typeInto('#strategic-goal-key', METRIC_KEY);
    await adminSession!.typeInto('#strategic-goal-label', METRIC_LABEL);
    await adminSession!.typeInto('#strategic-goal-target', TARGET_VALUE);
    const created = adminSession!.armResponse('/api/v1/strategic-goals', 'POST');
    await adminSession!.submitForm('#strategic-goal-create');
    expect(await created).toBe(201);
    await adminSession!.waitForText('#strategic-goals-table', new RegExp(METRIC_LABEL), 20_000);

    const afterCreate = await readGoalRows(dbClient!, fixture.tenantId, METRIC_KEY);
    const createdRow = afterCreate.find((row) => row.deleted_at === null);
    expect(createdRow).toBeDefined();
    expect(String(createdRow?.academic_year)).toBe(year);
    expect(String(createdRow?.metric_label)).toBe(METRIC_LABEL);
    expect(Number(createdRow?.target_value)).toBe(Number(TARGET_VALUE));
    expect(createdRow?.progress_value).toBeNull();

    // Gerçekleşme girişi: yine yalnız UI üzerinden.
    await adminSession!.clickElement('button[data-action="strategic-goal-progress"]');
    await adminSession!.typeInto('#strategic-goal-progress-value', PROGRESS_VALUE);
    const patched = adminSession!.armResponse('/api/v1/strategic-goals/', 'PATCH');
    await adminSession!.submitForm('#strategic-goal-progress');
    expect(await patched).toBe(200);
    await adminSession!.waitForText('#strategic-goals-table', /%97,9/, 20_000);

    const afterProgress = await readGoalRows(dbClient!, fixture.tenantId, METRIC_KEY);
    expect(Number(afterProgress.find((row) => row.deleted_at === null)?.progress_value)).toBe(
      Number(PROGRESS_VALUE),
    );

    // Silme: onay bölgesi açılır, silme yine UI üzerinden.
    await adminSession!.clickElement('button[data-action="strategic-goal-delete"]');
    await adminSession!.waitForText('#strategic-goal-delete', /silmek istediğinizden emin misiniz/i, 20_000);
    const deleted = adminSession!.armResponse('/api/v1/strategic-goals/', 'DELETE');
    await adminSession!.clickElement('button[data-action="strategic-goal-delete-confirm"]');
    expect(await deleted).toBe(200);
    await adminSession!.waitForText('#strategic-goals-table', /Hedef yok|hedef tanımlanmamış/i, 20_000);

    const afterDelete = await readGoalRows(dbClient!, fixture.tenantId, METRIC_KEY);
    expect(afterDelete.find((row) => row.deleted_at === null)).toBeUndefined();
    expect(afterDelete.some((row) => row.deleted_at !== null)).toBe(true);

    await adminSession!.screenshot('strategic-goals-admin-journey');
  });

  it('öğretmen aynı okulun hedeflerini salt-okunur görür', async () => {
    // Önce yönetici bir hedef tanımlar (yolculuk kalıcılığı için).
    await loginViaUi(adminSession!, fixture.adminUser.email, fixture.adminUser.credential);
    await openStrategicGoals(adminSession!);
    await adminSession!.clickElement('#strategic-goals-add');
    await adminSession!.typeInto('#strategic-goal-key', METRIC_KEY);
    await adminSession!.typeInto('#strategic-goal-label', METRIC_LABEL);
    await adminSession!.typeInto('#strategic-goal-target', TARGET_VALUE);
    const created = adminSession!.armResponse('/api/v1/strategic-goals', 'POST');
    await adminSession!.submitForm('#strategic-goal-create');
    expect(await created).toBe(201);
    await adminSession!.waitForText('#strategic-goals-table', new RegExp(METRIC_LABEL), 20_000);

    await loginViaUi(teacherSession!, fixture.teacherUser.email, fixture.teacherUser.credential);
    await openStrategicGoals(teacherSession!);
    await teacherSession!.waitForText('#strategic-goals-table', new RegExp(METRIC_LABEL), 20_000);

    // Yazma kontrolü öğretmenin DOM'unda yoktur.
    expect(await teacherSession!.countElements('#strategic-goals-add')).toBe(0);
    expect(await teacherSession!.countElements('button[data-action="strategic-goal-progress"]')).toBe(0);
    expect(await teacherSession!.countElements('button[data-action="strategic-goal-delete"]')).toBe(0);
    expect(await teacherSession!.countElements('#strategic-goal-create')).toBe(0);
    expect(await teacherSession!.countElements('#strategic-goal-progress')).toBe(0);

    // Öğretmenin yazma isteği doğrudan gönderilirse sunucu 403 döner.
    const token = await loginForApi(
      environment.baseUrl,
      fixture.teacherUser.email,
      fixture.teacherUser.credential,
    );
    const forbidden = await fetch(`${environment.baseUrl}/api/v1/strategic-goals`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        academicYear: await readSelectedYear(teacherSession!),
        metricKey: `${METRIC_KEY}_teacher_denemesi`,
        targetValue: 1,
      }),
    });
    expect(forbidden.status).toBe(403);

    await teacherSession!.screenshot('strategic-goals-teacher-readonly');
  });

  it('bayrak kapalıyken yüzey görünmez ve rota 404 döner', async () => {
    const flagOffPort = environment.port + 7;
    const flagOffBaseUrl = `http://127.0.0.1:${flagOffPort}`;
    const flagOffServer = await startRuntimeServer({
      baseUrl: flagOffBaseUrl,
      port: flagOffPort,
      artifactDir: path.join(environment.artifactDir, 'strategic-goals-flag-off'),
      env: { STRATEGIC_GOALS_ENABLED: 'false' },
    });
    const session = await createUiSession({
      browser: browser!,
      baseUrl: flagOffBaseUrl,
      screenshotDir: path.join(environment.artifactDir, 'strategic-goals-flag-off'),
      index: screenshotIndex,
    });
    try {
      await loginViaUi(session, fixture.adminUser.email, fixture.adminUser.credential);
      await waitForTab(session, 'yonetim');
      await session.clickElement('.tab[data-tab="yonetim"]');
      await sleep(1_000);
      expect(await session.isVisible('#strategic-goals-section')).toBe(false);
      expect(await session.countElements('#strategic-goals-table tr')).toBe(0);

      const token = await loginForApi(
        flagOffBaseUrl,
        fixture.adminUser.email,
        fixture.adminUser.credential,
      );
      const response = await fetch(`${flagOffBaseUrl}/api/v1/strategic-goals`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(404);
      await session.screenshot('strategic-goals-flag-off');
    } finally {
      await session.close();
      await flagOffServer.stop();
    }
  });
});
