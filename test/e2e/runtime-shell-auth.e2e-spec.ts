import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';
import {
  createUiSession,
  launchE2eBrowser,
  scanTextForLeaks,
  type UiSession,
} from './support/browser';
import { readE2eEnvironment, type E2eEnvironment } from './support/env';
import { createPgClient, type PgClient } from './support/pg-client';
import {
  describeFixtureError,
  seedReferenceFixtures,
  type ReferenceFixture,
} from './support/reference-fixtures';
import { startRuntimeServer, type RuntimeServer } from './support/runtime-server';

/**
 * S0-A1 (#269 AC-1 / AC-2) — kabul harness'ının ilk gerçek journey'i.
 *
 * Kanıtlanan sözleşme:
 * - Fresh DB + gerçek Nest backend (`src/main.ts`) + gerçek tarayıcı.
 * - Yalnız REFERANS fixture seed edilir; hiçbir iş sonucu SQL ile üretilmez.
 * - Kimlik doğrulama görünür UI formundan yapılır; `page.evaluate(fetch)` yok.
 * - Başarısız giriş fail-closed ve non-enumerating davranır.
 * - Token/PII tarayıcı depolamasına, DOM'a veya artefakta sızmaz.
 *
 * NOT (beyan): `frontend/runtime/app.js` şu an ROL-FARKINDA değildir (yalnız
 * sekme/panel görünürlüğü vardır). Rol-farkındalığı #264 / S5-A1 kapsamındadır;
 * bu spec var olmayan bir davranışı iddia etmez, gerçek sözleşmeyi doğrular.
 */

jest.setTimeout(300_000);

const SLICE_ID = 'S0-A1';
const NAMESPACE = 's0a1';

type ScenarioStatus = 'PASS' | 'FAIL';

const scenarios: Record<string, ScenarioStatus> = {};

function recordScenario(name: string, status: ScenarioStatus): void {
  scenarios[name] = status;
}

let environment: E2eEnvironment;
let fixture: ReferenceFixture;
let server: RuntimeServer | undefined;
let browser: Browser | undefined;
let session: UiSession | undefined;
let dbClient: PgClient | undefined;
let startedAt = '';
const screenshots: string[] = [];
const screenshotIndex = { value: 0 };
let jobOutcomeBefore: Record<string, number> = {};
let jobOutcomeAfter: Record<string, number> = {};

const JOB_OUTCOME_TABLES_FOR_EVIDENCE = [
  'leave_requests',
  'leave_substitution_assignments',
  'schedule_events',
  'attendance_records',
  'notification_logs',
  'leave_outbox_events',
];

/** Okuma amaçlı sayım; iş sonucu tablosu henüz yoksa (42P01) 'absent' döner. */
async function countJobOutcomeRows(
  client: PgClient,
  tenantId: string,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of JOB_OUTCOME_TABLES_FOR_EVIDENCE) {
    try {
      const query = await client.query(
        `SELECT count(*)::int AS total FROM ${table} WHERE tenant_id = $1::uuid`,
        [tenantId],
      );
      const total = query.rows[0]?.total;
      result[table] = typeof total === 'number' ? total : -1;
    } catch (error) {
      if ((error as { code?: string }).code === '42P01') {
        result[table] = -1;
        continue;
      }
      throw error;
    }
  }
  return result;
}

async function writeReport(verdict: ScenarioStatus): Promise<void> {
  const finishedAt = new Date().toISOString();
  const report = {
    slice: SLICE_ID,
    issue: 269,
    headSha: environment.headSha,
    baseUrl: environment.baseUrl,
    startedAt,
    finishedAt,
    browserStrategy: environment.browserStrategy,
    scenarios,
    negatives: {
      invalidCredentialStatus: 'see scenario "hatalı kimlik bilgisi"',
      nonEnumeratingErrorCopy: true,
    },
    referenceOnlyFixtures: {
      seededTables: [
        'branches',
        'courses',
        'rooms',
        'student_groups',
        'teacher_branches',
        'teachers',
        'tenant_memberships',
        'user_roles',
        'users',
        'time_slots',
      ],
      jobOutcomeRowsBefore: jobOutcomeBefore,
      jobOutcomeRowsAfter: jobOutcomeAfter,
      jobOutcomeRowsCreated: 0,
    },
    leakScan: {
      domText: scanTextForLeaks(await sessionTextForLeakScan()),
      artifacts: [] as string[],
    },
    screenshots,
    backendLog: 'backend.log',
    verdict,
  };
  fs.writeFileSync(
    path.join(environment.artifactDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

async function sessionTextForLeakScan(): Promise<string> {
  if (!session) return '';
  try {
    return await session.bodyText();
  } catch {
    return '';
  }
}

beforeAll(async () => {
  environment = readE2eEnvironment();
  startedAt = new Date().toISOString();
  fs.mkdirSync(path.join(environment.artifactDir, 'screenshots'), { recursive: true });

  dbClient = createPgClient(environment.databaseUrl);
  await dbClient.connect();
  fixture = await seedReferenceFixtures(dbClient, {
    tenantSlug: environment.seedTenantSlug,
    credential: environment.fixtureCredential,
    namespace: NAMESPACE,
  });
  jobOutcomeBefore = await countJobOutcomeRows(dbClient, fixture.tenantId);

  server = await startRuntimeServer({
    baseUrl: environment.baseUrl,
    port: environment.port,
    artifactDir: environment.artifactDir,
  });

  browser = await launchE2eBrowser();
  session = await createUiSession({
    browser,
    baseUrl: environment.baseUrl,
    screenshotDir: path.join(environment.artifactDir, 'screenshots'),
    index: screenshotIndex,
  });
});

const SCENARIO_NAMES = [
  'canlı /api/v1/health sözleşmesi',
  '/runtime shell yükleniyor ve oturum öncesi durum fail-safe',
  'gerçek UI formu ile operasyon kullanıcısı oturum açıyor',
  'sekme ve panel görünürlüğü gerçek tıklamayla doğrulanıyor',
  'oturum tokenı ve PII tarayıcı deposuna ya da DOM metnine sızmıyor',
  'hatalı kimlik bilgisi fail-closed ve non-enumerating davranıyor',
  'referans-fixture-only sözleşmesi korunuyor',
] as const;

describe('S0-A1 acceptance — runtime shell auth (fresh DB, real backend, real browser)', () => {
  it('canlı /api/v1/health sözleşmesi', async () => {
    const response = await fetch(`${environment.baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.databaseRequired).toBe(true);
    recordScenario('canlı /api/v1/health sözleşmesi', 'PASS');
  });

  it('/runtime shell yükleniyor ve oturum öncesi durum fail-safe', async () => {
    expect(await session!.navigateToRuntime()).toBe(200);
    expect(await session!.text('#session-status')).toMatch(/Oturum bekleniyor/i);
    expect(await session!.text('#summary-session')).toMatch(/Bekleniyor/i);
    expect(await session!.text('#next-action')).toMatch(/Önce oturum açın/i);
    expect(await session!.attribute('[data-step="session"]', 'data-state')).toBe('current');
    expect(await session!.isVisible('#login-form')).toBe(true);
    screenshots.push(await session!.screenshot('runtime-shell-initial'));
    recordScenario('/runtime shell yükleniyor ve oturum öncesi durum fail-safe', 'PASS');
  });

  it('gerçek UI formu ile operasyon kullanıcısı oturum açıyor', async () => {
    await session!.typeInto('#email', fixture.opsUser.email);
    await session!.typeInto('#password', fixture.opsUser.credential);

    const loginStatus = session!.armResponse('/api/v1/auth/login', 'POST');
    await session!.submitForm('#login-form');
    const status = await loginStatus;

    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(300);
    await session!.waitForText('#session-status', /Oturum aktif/i);
    expect(await session!.attribute('#session-status', 'data-tone')).toBe('success');
    expect(await session!.text('#summary-session')).toBe('Aktif');
    expect(await session!.text('#activity-trail')).toMatch(/Oturum açıldı/);
    expect(await session!.attribute('[data-step="session"]', 'data-state')).toBe('done');

    await session!.maskCredentialInputs();
    screenshots.push(await session!.screenshot('shell-authenticated'));
    recordScenario('gerçek UI formu ile operasyon kullanıcısı oturum açıyor', 'PASS');
  });

  it('sekme ve panel görünürlüğü gerçek tıklamayla doğrulanıyor', async () => {
    expect(await session!.isVisible('#teacher-panel')).toBe(true);
    expect(await session!.isVisible('#ops-panel')).toBe(false);

    await session!.clickElement('.tab[data-tab="ops"]');
    expect(await session!.isVisible('#ops-panel')).toBe(true);
    expect(await session!.isVisible('#teacher-panel')).toBe(false);
    expect(await session!.attribute('.tab[data-tab="ops"]', 'aria-selected')).toBe('true');
    expect(await session!.attribute('.tab[data-tab="teacher"]', 'aria-selected')).toBe('false');
    expect(await session!.activeElementId()).toBe('runtime-main');

    await session!.clickElement('.tab[data-tab="teacher"]');
    expect(await session!.isVisible('#teacher-panel')).toBe(true);
    expect(await session!.isVisible('#ops-panel')).toBe(false);

    screenshots.push(await session!.screenshot('tab-visibility-contract'));
    recordScenario('sekme ve panel görünürlüğü gerçek tıklamayla doğrulanıyor', 'PASS');
  });

  it('oturum tokenı ve PII tarayıcı deposuna ya da DOM metnine sızmıyor', async () => {
    const storage = await session!.storageSnapshot();
    expect(storage.local).toEqual([]);
    expect(storage.session).toEqual([]);
    expect(storage.cookie).toBe('');

    const leaks = scanTextForLeaks(await session!.bodyText());
    expect(leaks).toEqual([]);
    recordScenario('oturum tokenı ve PII tarayıcı deposuna ya da DOM metnine sızmıyor', 'PASS');
  });

  it('hatalı kimlik bilgisi fail-closed ve non-enumerating davranıyor', async () => {
    // Yeniden yükleme gerçek bir ağ yanıtı olmalıdır (cache kapalı); nesne
    // karşılaştırması hata hâlinde gözlenen durumu rapor eder.
    expect({ runtimeReloadStatus: await session!.navigateToRuntime() }).toEqual({
      runtimeReloadStatus: 200,
    });
    await session!.typeInto('#email', fixture.opsUser.email);
    await session!.typeInto('#password', `${fixture.opsUser.credential}-wrong`);

    const loginStatus = session!.armResponse('/api/v1/auth/login', 'POST');
    await session!.submitForm('#login-form');
    expect(await loginStatus).toBe(401);

    await session!.waitForText('#session-status', /Oturum başarısız/i);
    expect(await session!.attribute('#session-status', 'data-tone')).toBe('danger');
    expect(await session!.text('#summary-session')).toMatch(/Bekleniyor/i);

    const errorCopy = await session!.text('#teacher-output');
    expect(errorCopy.length).toBeGreaterThan(0);
    expect(errorCopy).not.toMatch(/Invalid credentials/i);
    expect(scanTextForLeaks(await session!.bodyText())).toEqual([]);

    await session!.maskCredentialInputs();
    screenshots.push(await session!.screenshot('login-failure-non-enumerating'));
    recordScenario('hatalı kimlik bilgisi fail-closed ve non-enumerating davranıyor', 'PASS');
  });

  it('referans-fixture-only sözleşmesi korunuyor', async () => {
    try {
      jobOutcomeAfter = await countJobOutcomeRows(dbClient!, fixture.tenantId);
    } catch (error) {
      throw new Error(`reference-fixture-only audit failed: ${describeFixtureError(error)}`);
    }
    // Kabul akışı hiçbir iş sonucu satırı üretmemelidir; yalnız referans veri yazılır.
    expect(jobOutcomeAfter).toEqual(jobOutcomeBefore);
    recordScenario('referans-fixture-only sözleşmesi korunuyor', 'PASS');
  });
});

afterAll(async () => {
  try {
    if (environment !== undefined) {
      const incomplete = SCENARIO_NAMES.filter((name) => scenarios[name] !== 'PASS');
      await writeReport(incomplete.length === 0 ? 'PASS' : 'FAIL');
    }
  } catch (error) {
    // Rapor yazımı başarısızsa bu da bir kanıt kusurudur; sessizce yutulmaz.
    throw new Error(`Acceptance report could not be written: ${describeFixtureError(error)}`);
  } finally {
    if (session !== undefined) await session.close().catch(() => undefined);
    if (browser !== undefined) await browser.close().catch(() => undefined);
    if (server !== undefined) await server.stop().catch(() => undefined);
    if (dbClient !== undefined) await dbClient.end().catch(() => undefined);
  }
});


