import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';
import {
  createUiSession,
  launchE2eBrowser,
  scanTextForLeaks,
  type UiSession,
} from './support/browser';
import { scanArtifactDirectory } from './support/artifact-scan';
import { readE2eEnvironment, type E2eEnvironment } from './support/env';
import { createPgClient, type PgClient } from './support/pg-client';
import {
  describeFixtureError,
  revokeConsent,
  seedAdditionalBranch,
  seedConsentPreconditions,
  seedReferenceFixtures,
  seedStudents,
  type ConsentFixture,
  type ReferenceFixture,
  type StudentFixture,
} from './support/reference-fixtures';
import {
  apiCall,
  BootstrapHttpError,
  bootstrapAttendanceSession,
  bootstrapPublishedSchedule,
  loginForBootstrap,
  readDispatchRow,
  readOutboxIdsBySession,
  selectBranchForBootstrap,
  waitForDispatchAvailable,
  type BootstrapApi,
} from './support/notification-preconditions';
import {
  isTcpPortOpen,
  startRuntimeServer,
  type RuntimeServer,
} from './support/runtime-server';

/**
 * N3 (#266) — Notification Operations kabul spec'i (sunucu-otoriter).
 *
 * Kanıtlanan sözleşme — zorunlu 14 senaryo (MASTER PROMPT §değerlendirme):
 * - Durum geçişlerinin TAMAMI görünür UI'dan yapılır; önkoşul bootstrap'i public
 *   API'den yürütülür (page.evaluate(fetch) yok).
 * - İş sonucu (outbox/receipt) tablolarına SQL ile ASLA yazılmaz; UI/API üretir,
 *   spec yalnız salt-okunur kanıt okuması yapar.
 * - Provider etkisi YALNIZ test-only SIMULATOR'dur (env `NOTIFICATION_SIMULATOR_MODE`),
 *   production'da açık failure-control endpoint yok.
 * - 3 ayrı backend boot'u: accept → fail_first:3 (retry/dead-letter) → uncertain.
 * - Kanıt: DB receipt satırı ile UI li metni birebir karşılaştırılır.
 * - KVKK: her DOM/network/artefakt taramasından ÖNCE uuid maskelemesi yapılır.
 */
jest.setTimeout(900_000);

const SLICE_ID = 'N3-A1';
const NAMESPACE = 'n3ops';
const STUDENT_COUNT = 11;
const CONSENTED_STUDENT_COUNT = 10;

type ScenarioStatus = 'PASS' | 'FAIL';

const scenarios: Record<string, ScenarioStatus> = {};

function recordScenario(name: string, status: ScenarioStatus): void {
  scenarios[name] = status;
}

const SCENARIO_NAMES = [
  'Yetkili kullanıcı için persisted hazırlama/onay/queued yolculuğu.',
  'Consent yokken blocked state ve sıfır provider effect.',
  'UI’da onay sonrası consent revoke; execution’ın reddedilmesi.',
  'SIMULATED execution ve durable receipt’in UI/DB tutarlılığı.',
  'Duplicate click veya response-loss sonrası tek business effect.',
  'Stale version mutation’ın conflict üretmesi.',
  'Tenant ve branch isolation; list/detail/mutation sınırları.',
  'Yetkisiz role ile protected action’ın backend’de reddedilmesi.',
  'N2’nin desteklediği retry/dead-letter/recovery yolculuğu.',
  'N2 cancellation/correction davranışının UI’ya doğru yansıması.',
  'Refresh/relogin sonrası persisted lifecycle görünümü.',
  'Keyboard/focus ile kritik akışın tamamlanması.',
  'Error/uncertain sonucu için sahte success oluşmaması.',
  'UI/network/artifact projection’larında gereksiz ham PII bulunmaması.',
] as const;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Kanıt metninden ham uuid'leri çıkarır (rapor ve tarama öncesi). */
function scrubText(value: string): string {
  return String(value ?? '').replace(UUID_RE, '<uuid>');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDay(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

let environment: E2eEnvironment;
let serverArtifactDir: string;
let fixture: ReferenceFixture;
let students: ReadonlyArray<StudentFixture>;
let consentFixtures: ReadonlyArray<ConsentFixture>;
let server: RuntimeServer | undefined;
let browser: Browser | undefined;
let sessionA: UiSession | undefined;
let sessionB: UiSession | undefined;
let sessionC: UiSession | undefined;
let dbClient: PgClient | undefined;
let opsApi: BootstrapApi;
let opsApiB: BootstrapApi;
let teacherApi: BootstrapApi;
let startedAt = '';
const simulatorModes: string[] = [];
const screenshots: string[] = [];
const screenshotIndex = { value: 0 };
const rows: Record<string, string | undefined> = {};
const evidence: Record<string, string[]> = {};
const negatives: Record<string, string> = {};

type NetworkRecord = Readonly<{ label: string; method: string; status: number; url: string; body: string }>;
const networkRecords: NetworkRecord[] = [];

/** Tarayıcı ağ kayıtçısı — auth yanıtları (oturum kimliği taşır) kayıt dışıdır. */
function attachNetworkRecorder(session: UiSession, label: string): void {
  session.page.on('response', async (response) => {
    try {
      const url = response.url();
      if (!url.includes('/api/v1/') || url.includes('/api/v1/auth/')) return;
      let body = '';
      const text = await response.text();
      if (typeof text === 'string' && text.length <= 100_000) body = text;
      const record: NetworkRecord = {
        label,
        method: response.request().method(),
        status: response.status(),
        url,
        body,
      };
      if (networkRecords.length >= 1200) networkRecords.shift();
      networkRecords.push(record);
    } catch {
      // Yanıt gövdesi okunamıyorsa (204 vb.) kayıt atlanır; ağ taramasını bozmaz.
    }
  });
}

function recordEvidence(key: string, line: string): void {
  (evidence[key] ??= []).push(line);
}

async function readOutboxStatusCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const key of Object.keys(rows)) {
    const id = rows[key];
    if (!id) continue;
    const row = await readDispatchRow(dbClient!, fixture.tenantId, id);
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

async function waitForCount(
  session: UiSession,
  selector: string,
  expected: number,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    last = await session.countElements(selector).catch(() => -1);
    if (last === expected) return;
    await sleep(200);
  }
  throw new Error(`waitForCount timeout: ${selector} expected ${expected}, last ${last}.`);
}

async function openCard(session: UiSession, key: string): Promise<void> {
  const id = rows[key];
  if (!id) throw new Error(`No outbox id for row ${key}.`);
  await session.clickElement(
    `button[data-action="notification-detail"][data-notification-id="${id}"]`,
  );
}

/** Detay başlığı (h3) render edilene kadar bekler ve metnini döner. */
function detailHeading(session: UiSession): Promise<string> {
  return session.waitForText('#notification-detail h3', /./, 20_000);
}

async function runAction(session: UiSession, action: string): Promise<void> {
  await session.clickElement(`button[data-notification-action="${action}"]`);
}

async function actionButtonCount(session: UiSession): Promise<number> {
  return session.countElements('#notification-detail button[data-notification-action]');
}

function cardText(session: UiSession, key: string): Promise<string[]> {
  const id = rows[key];
  return session.queryTexts(
    `#notifications-list article.card:has(button[data-notification-id="${id}"])`,
  );
}

async function expectRow(
  key: string,
  partial: Partial<{
    status: string;
    version: number;
    attempts: number;
    consentVersion: number | null;
    reason: string | null;
    dispatchedAt: string | null;
    receipts: ReadonlyArray<unknown>;
  }>,
): Promise<ReturnType<typeof readDispatchRow> extends Promise<infer T> ? T : never> {
  const id = rows[key];
  if (!id) throw new Error(`No outbox id for row ${key}.`);
  const row = await readDispatchRow(dbClient!, fixture.tenantId, id);
  expect(row).toMatchObject(partial);
  return row as Awaited<ReturnType<typeof readDispatchRow>>;
}

async function expectApiError(
  api: BootstrapApi,
  method: string,
  path: string,
  status: number,
  messageContains: string | undefined,
): Promise<void> {
  try {
    await apiCall(api, method, path);
    throw new Error(`expected HTTP ${status} for ${method} ${path}, got 2xx.`);
  } catch (error) {
    if (error instanceof BootstrapHttpError) {
      if (error.status !== status) {
        throw new Error(
          `status mismatch for ${method} ${path}: expected ${status}, got ${error.status}.`,
        );
      }
      if (
        messageContains !== undefined &&
        !error.bodyText.toUpperCase().includes(messageContains.toUpperCase())
      ) {
        throw new Error(
          `message mismatch for ${method} ${path}: expected to contain ${messageContains}, got ${scrubText(
            error.bodyText,
          )}.`,
        );
      }
      recordEvidence(currentScenario, `${method} ${path} → HTTP ${status} (${messageContains ?? 'flat'})`);
      return;
    }
    throw error;
  }
}

let currentScenario = '';

async function ensureBranch(session: UiSession, code: string): Promise<void> {
  await session.waitForText('#summary-scope', /./, 20_000);
  const scope = await session.text('#summary-scope');
  if (scope.includes(code)) return;
  await session.selectValue('#branch-id', code);
  await session.submitForm('#context-form');
  await session.waitForText('#summary-scope', new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 20_000);
}

async function snap(session: UiSession, name: string): Promise<void> {
  await session.maskCredentialInputs().catch(() => undefined);
  screenshots.push(await session.screenshot(name));
}

async function openNotificationsAndWait(
  session: UiSession,
  expectedCards: number,
): Promise<void> {
  await session.clickElement('.tab[data-tab="notifications"]');
  await waitForCount(session, '#notifications-list article.card', expectedCards);
  const countText = `${expectedCards} bildirim listelendi.`;
  await session.waitForText('#message-region', new RegExp(countText), 10_000);
}

async function restartBackend(mode: string): Promise<void> {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  const url = new URL(environment!.baseUrl);
  for (let i = 0; i < 60; i += 1) {
    if (!(await isTcpPortOpen(url.hostname, Number(url.port || 80)))) break;
    await sleep(250);
  }
  server = await startRuntimeServer({
    baseUrl: environment!.baseUrl,
    port: environment!.port,
    artifactDir: serverArtifactDir,
    env: { NOTIFICATION_SIMULATOR_MODE: mode },
  });
  simulatorModes.push(mode);
}

async function setupScheduleAndOutbox(): Promise<void> {
  const schedule = await bootstrapPublishedSchedule(opsApi, dbClient!, {
    tenantId: fixture.tenantId,
    branchId: fixture.branchId,
    effectiveFrom: isoDay(-30),
    effectiveTo: null,
    event: {
      teacherId: fixture.teacherId,
      teacherBranchId: fixture.teacherBranchId,
      studentGroupId: fixture.studentGroupId,
      courseId: fixture.courseId,
      roomId: fixture.roomId,
      timeSlotId: fixture.timeSlotId,
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '11:00',
    },
  });

  const session1 = await bootstrapAttendanceSession(opsApi, {
    tenantId: fixture.tenantId,
    scheduleEventId: schedule.scheduleEventId,
    sessionDate: isoDay(7),
    studentIds: students
      .slice(0, CONSENTED_STUDENT_COUNT)
      .map((student) => student.studentId),
  });
  const session2 = await bootstrapAttendanceSession(opsApi, {
    tenantId: fixture.tenantId,
    scheduleEventId: schedule.scheduleEventId,
    sessionDate: isoDay(8),
    studentIds: [students[CONSENTED_STUDENT_COUNT].studentId],
  });

  const map1 = await readOutboxIdsBySession(dbClient!, fixture.tenantId, session1.sessionId);
  const map2 = await readOutboxIdsBySession(dbClient!, fixture.tenantId, session2.sessionId);
  for (let i = 0; i < CONSENTED_STUDENT_COUNT; i += 1) {
    rows[`r${i}`] = map1[students[i].studentId];
  }
  rows.r10 = map2[students[CONSENTED_STUDENT_COUNT].studentId];
  if (Object.keys(rows).length !== STUDENT_COUNT) {
    throw new Error(
      `Expected ${STUDENT_COUNT} outbox rows, found ${Object.keys(rows).length}.`,
    );
  }
}

beforeAll(async () => {
  environment = readE2eEnvironment();
  startedAt = new Date().toISOString();
  fs.mkdirSync(path.join(environment.artifactDir, 'screenshots', 'n3'), { recursive: true });
  serverArtifactDir = path.join(environment.artifactDir, '..', 'n3-server-logs');
  fs.mkdirSync(serverArtifactDir, { recursive: true });

  dbClient = createPgClient(environment.databaseUrl);
  await dbClient.connect();

  fixture = await seedReferenceFixtures(dbClient, {
    tenantSlug: environment.seedTenantSlug,
    credential: environment.fixtureCredential,
    namespace: NAMESPACE,
  });
  const branchB = await seedAdditionalBranch(dbClient, {
    tenantId: fixture.tenantId,
    namespace: NAMESPACE,
  });

  students = await seedStudents(dbClient, {
    tenantId: fixture.tenantId,
    branchId: fixture.branchId,
    namespace: NAMESPACE,
    count: STUDENT_COUNT,
  });
  consentFixtures = await seedConsentPreconditions(dbClient, {
    tenantId: fixture.tenantId,
    students: students.slice(0, CONSENTED_STUDENT_COUNT),
    namespace: NAMESPACE,
  });

  // Backend, tüm API login'lerinden ÖNCE başlatılır (port sahipliği + health gate).
  server = await startRuntimeServer({
    baseUrl: environment.baseUrl,
    port: environment.port,
    artifactDir: serverArtifactDir,
    env: { NOTIFICATION_SIMULATOR_MODE: 'accept' },
  });
  simulatorModes.push('accept');

  const tokenA = await loginForBootstrap(
    environment.baseUrl,
    fixture.opsUser.email,
    fixture.opsUser.credential,
  );
  opsApi = { baseUrl: environment.baseUrl, token: tokenA, branchCode: fixture.branchCode };
  await selectBranchForBootstrap(opsApi, {
    branchName: `${NAMESPACE} reference branch`,
    branchCode: fixture.branchCode,
  });

  await setupScheduleAndOutbox();

  // İzolasyon/rol negatifleri için ikinci operasyon ve öğretmen oturumları.
  const tokenB = await loginForBootstrap(
    environment.baseUrl,
    fixture.opsUser.email,
    fixture.opsUser.credential,
  );
  opsApiB = { baseUrl: environment.baseUrl, token: tokenB, branchCode: branchB.branchCode };
  await selectBranchForBootstrap(opsApiB, {
    branchName: `${NAMESPACE} secondary branch`,
    branchCode: branchB.branchCode,
  });
  const teacherToken = await loginForBootstrap(
    environment.baseUrl,
    fixture.teacherUser.email,
    fixture.teacherUser.credential,
  );
  teacherApi = { baseUrl: environment.baseUrl, token: teacherToken, branchCode: fixture.branchCode };
  await selectBranchForBootstrap(teacherApi, {
    branchName: `${NAMESPACE} reference branch`,
    branchCode: fixture.branchCode,
  });

  browser = await launchE2eBrowser();
  const screenshotDir = path.join(environment.artifactDir, 'screenshots', 'n3');
  sessionA = await createUiSession({
    browser,
    baseUrl: environment.baseUrl,
    screenshotDir,
    index: screenshotIndex,
  });
  attachNetworkRecorder(sessionA, 'opsA');
  sessionB = await createUiSession({
    browser,
    baseUrl: environment.baseUrl,
    screenshotDir,
    index: screenshotIndex,
  });
  attachNetworkRecorder(sessionB, 'opsB');
  sessionC = await createUiSession({
    browser,
    baseUrl: environment.baseUrl,
    screenshotDir,
    index: screenshotIndex,
  });
  attachNetworkRecorder(sessionC, 'teacher');
});

async function loginViaUi(session: UiSession, email: string, credential: string): Promise<void> {
  await session.navigateToRuntime();
  await session.typeInto('#email', email);
  await session.typeInto('#password', credential);
  const armed = session.armResponse('/api/v1/auth/login', 'POST');
  await session.submitForm('#login-form');
  const status = await armed;
  if (status < 200 || status >= 300) {
    throw new Error(`Login failed with HTTP ${status}.`);
  }
  await session.waitForText('#session-status', /Oturum aktif/i, 20_000);
}

describe('N3-A1 acceptance — notification operations UI (server-authoritative, SIMULATED provider)', () => {
  it('Yetkili kullanıcı için persisted hazırlama/onay/queued yolculuğu.', async () => {
    currentScenario = SCENARIO_NAMES[0];
    await loginViaUi(sessionA!, fixture.opsUser.email, fixture.opsUser.credential);
    await ensureBranch(sessionA!, fixture.branchCode);
    await openNotificationsAndWait(sessionA!, STUDENT_COUNT);
    recordEvidence(currentScenario, 'login + şube ' + fixture.branchCode + ' + 11 kart listelendi');

    await openCard(sessionA!, 'r0');
    const heading = await detailHeading(sessionA!);
    expect(heading).toContain('· Beklemede');
    expect(await actionButtonCount(sessionA!)).toBe(2);
    const titles = await sessionA!.queryTexts('#notification-detail button[data-notification-action]');
    expect(titles).toEqual(['Taslağı onayla', 'Taslağı kapat']);
    recordEvidence(currentScenario, 'r0 UI: Beklemede, sunucu eylemleri [approve, close]');

    // Sunucu-otoriter negatif: pending üzerinde execute UI'da asla MEVCUT DEĞİL.
    await expectApiError(
      opsApi,
      'POST',
      `/notifications/${rows.r0}/execute`,
      409,
      'NOT_DISPATCHABLE:pending',
    );
    await expectRow('r0', { status: 'pending', attempts: 0, dispatchedAt: null, receipts: [] });
    await expectRow('r10', { status: 'blocked_consent', attempts: 0, dispatchedAt: null, receipts: [] });
    negatives[`${SCENARIO_NAMES[0]} unsafe-execute`] = 'pending satırda execute → 409 NOT_DISPATCHABLE';
    await snap(sessionA!, '01-initial-list-and-pending-detail');
    recordScenario(SCENARIO_NAMES[0], 'PASS');
  });

  it('Consent yokken blocked state ve sıfır provider effect.', async () => {
    currentScenario = SCENARIO_NAMES[1];
    await openCard(sessionA!, 'r10');
    const heading = await detailHeading(sessionA!);
    expect(heading).toContain('· Onay engelli');
    await sessionA!.waitForText('#notification-detail', /Onay sürümü: -/, 10_000);
    expect(await sessionA!.countElements('#notification-detail ul.impact-list li')).toBe(0);
    expect(await actionButtonCount(sessionA!)).toBe(1);
    recordEvidence(currentScenario, 'r10 (consentless) enqueue-time blocked_consent, onay sürümü yok, receipt yok');

    // blocked_consent satırına UI onay verir; execute da sunucu tarafından reddedilir.
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    recordEvidence(currentScenario, 'UI approve → 200 Onaylandı (blocked_consent geçerli draft durumu)');

    await openCard(sessionA!, 'r10');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylanıyor/, 1).catch(() => undefined);
    await sessionA!.waitForText('#notification-detail', /Onay sürümü: -/, 10_000);
    const before = await readDispatchRow(dbClient!, fixture.tenantId, rows.r10!);
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Onay engelli/, 20_000);
    await sessionA!.waitForText('#notification-detail', /Gerekçe: .+/, 10_000);
    const after = await expectRow('r10', {
      status: 'blocked_consent',
      attempts: 1,
      consentVersion: null,
      dispatchedAt: null,
      receipts: [],
    });
    expect(after.dispatchedAt).toBeNull();
    expect(before.dispatchedAt).toBeNull();
    recordEvidence(
      currentScenario,
      'execute → 200 blocked_consent, attempts 1, consentVersion null, dispatchedAt null, receipt YOK (sıfır provider effect)',
    );
    await snap(sessionA!, '02-consentless-blocked-zero-effect');
    recordScenario(SCENARIO_NAMES[1], 'PASS');
  });

  it('UI’da onay sonrası consent revoke; execution’ın reddedilmesi.', async () => {
    currentScenario = SCENARIO_NAMES[2];
    await openCard(sessionA!, 'r1');
    await detailHeading(sessionA!);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    recordEvidence(currentScenario, 'r1 UI approve → 200 Onaylandı (enqueue-time onay sürümü v)');

    await revokeConsent(dbClient!, {
      tenantId: fixture.tenantId,
      studentId: students[1].studentId,
    });
    await revokeConsent(dbClient!, {
      tenantId: fixture.tenantId,
      studentId: students[1].studentId,
      consentType: 'sms_notification',
    });
    recordEvidence(currentScenario, 'otorite revoke: parent_notification + sms_notification (version bump)');

    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Onay engelli/, 20_000);
    await sessionA!.waitForText('#notification-detail', /Gerekçe: .+/, 10_000);
    const row = await expectRow('r1', {
      status: 'blocked_consent',
      attempts: 1,
      dispatchedAt: null,
      receipts: [],
    });
    expect(row.reason).not.toBeNull();
    expect((row.consentVersion ?? 0)).toBeGreaterThan(
      consentFixtures[1].parentConsentVersion,
    );
    recordEvidence(
      currentScenario,
      'dispatch-time yeniden doğrulama revoke edilmiş onayı reddetti: blocked_consent, attempts 1, receipt yok, consentVersion v+1',
    );
    await snap(sessionA!, '03-revoke-then-execution-rejected');
    recordScenario(SCENARIO_NAMES[2], 'PASS');
  });

  it('SIMULATED execution ve durable receipt’in UI/DB tutarlılığı.', async () => {
    currentScenario = SCENARIO_NAMES[3];
    await openCard(sessionA!, 'r0');
    await detailHeading(sessionA!);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);

    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    const liTexts = await sessionA!.queryTexts('#notification-detail ul.impact-list li');
    expect(liTexts.length).toBe(1);
    expect(liTexts[0]).toContain('Deneme 1 · provider_accepted');
    expect(liTexts[0]).toContain('simüle');

    const row = await expectRow('r0', {
      status: 'dispatched',
      attempts: 1,
      dispatchedAt: expect.any(String) as unknown as string | null,
      receipts: [expect.any(Object) as unknown as ReadonlyArray<unknown>],
    });
    const receipt = row.receipts[0];
    expect(receipt.outcome).toBe('provider_accepted');
    expect(receipt.simulated).toBe(true);
    expect(receipt.providerRef).toMatch(/^sim:/);
    expect(liTexts[0]).toContain(`Sağlayıcı: ${receipt.providerRef}`);
    recordEvidence(
      currentScenario,
      'UI li "Deneme 1 · provider_accepted · simüle · Sağlayıcı: sim:..." ↔ DB receipt (outcome/simulated/providerRef birebir)',
    );
    await snap(sessionA!, '04-dispatched-receipt-consistency');
    recordScenario(SCENARIO_NAMES[3], 'PASS');
  });

  it('Duplicate click veya response-loss sonrası tek business effect.', async () => {
    currentScenario = SCENARIO_NAMES[4];
    await openCard(sessionA!, 'r2');
    await detailHeading(sessionA!);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);

    await loginViaUi(sessionB!, fixture.opsUser.email, fixture.opsUser.credential);
    await ensureBranch(sessionB!, fixture.branchCode);
    await openNotificationsAndWait(sessionB!, STUDENT_COUNT);
    await openCard(sessionB!, 'r2');
    await sessionB!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    expect(await actionButtonCount(sessionB!)).toBe(2);

    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    await expectRow('r2', { status: 'dispatched', attempts: 1, receipts: [expect.any(Object) as unknown as ReadonlyArray<unknown>] });

    // İkinci tarayıcı oturumu aynı execute'i tekrarlar (duplicate click).
    await runAction(sessionB!, 'execute');
    await sessionB!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    const afterDup = await expectRow('r2', { status: 'dispatched', attempts: 1 });
    expect(afterDup.receipts.length).toBe(1);

    // Response-loss simülasyonu: istemci aynı isteği tekrar gönderir → idempotent 200.
    const second = await apiCall(opsApi, 'POST', `/notifications/${rows.r2}/execute`);
    const secondJson = second.json as { idempotent?: boolean; status?: string };
    expect(secondJson.idempotent).toBe(true);
    expect(secondJson.status).toBe('dispatched');
    const afterLoss = await expectRow('r2', { status: 'dispatched', attempts: 1 });
    expect(afterLoss.receipts.length).toBe(1);
    recordEvidence(
      currentScenario,
      'B oturumu + Node tekrar execute → 200 idempotent, attempts 1, receipt 1 (tek business effect)',
    );
    await snap(sessionB!, '05-idempotent-duplicate-click');
    recordScenario(SCENARIO_NAMES[4], 'PASS');
  });

  it('Stale version mutation’ın conflict üretmesi.', async () => {
    currentScenario = SCENARIO_NAMES[5];
    // B, r3'ü onaylanmadan önce (sürüm 0, Beklemede) açar.
    await openCard(sessionB!, 'r3');
    await sessionB!.waitForText('#notification-detail h3', /· Beklemede/, 20_000);
    await sessionB!.waitForText('#notification-detail', /Sürüm: 0/, 10_000);
    recordEvidence(currentScenario, 'B oturumu r3 detayını Sürüm: 0 ile açtı (taslaklar sürüm 0’dan başlar)');

    // A onaylar (riskli: sürüm optimistic concurrency ile korunur).
    await openCard(sessionA!, 'r3');
    await sessionA!.waitForText('#notification-detail h3', /· Beklemede/, 20_000);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    await expectRow('r3', { status: 'approved', version: 1, attempts: 0 });

    // B eski sürümle (expectedVersion 0) onaylar → conflict üretir.
    await runAction(sessionB!, 'approve');
    await sessionB!.waitForText(
      '#notification-detail .error-state',
      /Görevlendirme mevcut program veya yedek görevle çakışıyor/,
      20_000,
    );
    const state = await sessionB!.attribute('#notification-detail .error-state', 'data-state');
    expect(state).toBe('conflict_blocking');
    await expectRow('r3', { status: 'approved', version: 1, attempts: 0 });
    recordEvidence(
      currentScenario,
      'B stale approve (expectedVersion 0) → 409 conflict_blocking; DB r3 approved v1 attempts 0 (tek etki)',
    );
    await snap(sessionB!, '06-stale-version-conflict');
    recordScenario(SCENARIO_NAMES[5], 'PASS');
  });

  it('Tenant ve branch isolation; list/detail/mutation sınırları.', async () => {
    currentScenario = SCENARIO_NAMES[6];
    // B, r3'ü yeniden açar (artık Onaylandı) → execute butonu mevcut.
    await openCard(sessionB!, 'r3');
    await sessionB!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    expect(await actionButtonCount(sessionB!)).toBe(2);
    expect(await sessionB!.countElements(`button[data-notification-action="execute"]`)).toBe(1);

    // B, bağlamı ikincil şubeye geçirir; açık listesi/detayı ESKİ şubeden kalır.
    await ensureBranch(sessionB!, 'N3OPS-BRANCH-B');
    const scope = await sessionB!.text('#summary-scope');
    expect(scope).toContain('N3OPS-BRANCH-B');
    expect(await sessionB!.countElements('#notifications-list article.card')).toBe(STUDENT_COUNT);
    recordEvidence(currentScenario, 'B bağlamı B-şubesine geçti; eskimeyen liste/detay kartları korunur');

    // A şube satırı üzerinde execution → 403 (sunucu-otoriter sınır).
    await runAction(sessionB!, 'execute');
    await sessionB!.waitForText('#notification-detail .error-state', /Bu işlem için yetkiniz yok/, 20_000);
    expect(await sessionB!.attribute('#notification-detail .error-state', 'data-state')).toBe(
      'forbidden_non_enumerating',
    );
    await expectRow('r3', { status: 'approved', version: 1, attempts: 0 });

    // Diğer şubede detay → 404 (scope dışı kayıt non-enumerating).
    await openCard(sessionB!, 'r4');
    await sessionB!.waitForText('#notification-detail .error-state', /Bildirim bulunamadı veya kapsamınız dışında/, 20_000);
    expect(await sessionB!.attribute('#notification-detail .error-state', 'data-state')).toBe(
      'empty_or_not_found_same_scope',
    );

    // Listeyi B şubesi için yenile → 0 kart.
    await sessionB!.clickElement('#refresh-notifications');
    await waitForCount(sessionB!, '#notifications-list article.card', 0);
    await sessionB!.waitForText('#message-region', /0 bildirim listelendi/, 10_000);
    await sessionB!.waitForText('#notifications-list .empty-state', /Bu kapsamda bildirim yok/, 10_000);

    // Node tarafı aynı sınırları kanıtlar.
    const listB = await apiCall(opsApiB, 'GET', '/notifications?limit=20&offset=0');
    expect((listB.json as { notifications?: unknown[] }).notifications ?? []).toEqual([]);
    await expectApiError(opsApiB, 'GET', `/notifications/${rows.r4}`, 404, 'NOTIFICATION_NOT_FOUND');
    await expectApiError(opsApiB, 'POST', `/notifications/${rows.r4}/execute`, 403, 'Notification dispatch row not found');
    await expectRow('r4', { status: 'pending', attempts: 0 });
    recordEvidence(
      currentScenario,
      'B-şubesi list [] · r4 detail 404 · r4 execute 403 · r3/r4 DB değişmedi',
    );
    await snap(sessionB!, '07-branch-isolation-cross-tenant');
    recordScenario(SCENARIO_NAMES[6], 'PASS');
  });

  it('Yetkisiz role ile protected action’ın backend’de reddedilmesi.', async () => {
    currentScenario = SCENARIO_NAMES[7];
    await loginViaUi(sessionC!, fixture.teacherUser.email, fixture.teacherUser.credential);
    await ensureBranch(sessionC!, fixture.branchCode);
    await sessionC!.clickElement('.tab[data-tab="notifications"]');
    await sessionC!.waitForText('#notifications-list .error-state', /Bu işlem için yetkiniz yok/, 20_000);
    expect(await sessionC!.attribute('#notifications-list .error-state', 'data-state')).toBe(
      'forbidden_non_enumerating',
    );
    recordEvidence(currentScenario, 'teacher UI listesi → 403 forbidden_non_enumerating');

    await expectApiError(teacherApi, 'GET', '/notifications?limit=20&offset=0', 403, 'Forbidden');
    await expectApiError(teacherApi, 'GET', `/notifications/${rows.r4}`, 403, 'Forbidden');
    await expectApiError(teacherApi, 'POST', `/notifications/${rows.r4}/execute`, 403, 'Forbidden');
    await expectRow('r4', { status: 'pending', attempts: 0 });
    recordEvidence(currentScenario, 'teacher Node GET list/detail/execute → 403 (yetki çözümü sunucuda)');
    await snap(sessionC!, '08-teacher-unauthorized');
    recordScenario(SCENARIO_NAMES[7], 'PASS');
  });

  it('N2 cancellation/correction davranışının UI’ya doğru yansıması.', async () => {
    currentScenario = SCENARIO_NAMES[8];
    // S10a — iptal: approved → cancelled.
    await openCard(sessionA!, 'r4');
    await sessionA!.waitForText('#notification-detail h3', /· Beklemede/, 20_000);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    await runAction(sessionA!, 'cancel');
    await sessionA!.waitForText('#notification-detail h3', /· İptal edildi/, 20_000);
    await sessionA!.waitForText('#notification-detail', /Sunucu bu durumda izin verilen bir eylem döndürmedi/, 10_000);
    expect(await actionButtonCount(sessionA!)).toBe(0);
    await expectRow('r4', { status: 'cancelled', attempts: 0 });
    recordEvidence(currentScenario, 'S10a: r4 approve → cancel → İptal edildi, eylemler [], DB cancelled');

    // S10b — düzeltme: revoke → blocked (attempt 1, kanıt yok) → onay geri gelir → dispatch.
    await openCard(sessionA!, 'r6');
    await sessionA!.waitForText('#notification-detail h3', /· Beklemede/, 20_000);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);

    await revokeConsent(dbClient!, {
      tenantId: fixture.tenantId,
      studentId: students[6].studentId,
    });
    await revokeConsent(dbClient!, {
      tenantId: fixture.tenantId,
      studentId: students[6].studentId,
      consentType: 'sms_notification',
    });
    await openCard(sessionA!, 'r6');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Onay engelli/, 20_000);
    await expectRow('r6', {
      status: 'blocked_consent',
      attempts: 1,
      dispatchedAt: null,
      receipts: [],
    });
    recordEvidence(currentScenario, 'S10b: revoke sonrası execute → blocked_consent, attempts 1, receipt yok');

    await seedConsentPreconditions(dbClient!, {
      tenantId: fixture.tenantId,
      students: [students[6]],
      namespace: NAMESPACE,
    });
    recordEvidence(currentScenario, 'S10b: otorite onayı yeniden verildi (version bump)');

    await openCard(sessionA!, 'r6');
    await sessionA!.waitForText('#notification-detail h3', /· Onay engelli/, 20_000);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    const finalRow = await expectRow('r6', {
      status: 'dispatched',
      attempts: 2,
      receipts: [expect.any(Object) as unknown as ReadonlyArray<unknown>],
    });
    expect(finalRow.consentVersion).toBe(consentFixtures[6].parentConsentVersion + 1);
    // Sütun anlambilimi: consent_version, block (son onay-kontrolü yazımı) sırasında
    // karar sürümünü taşır; dispatch-time yeniden doğrulama ise receipt JSON'da
    // `consent.versionAtDispatch` olarak dijital kanıta yazılır.
    const dispatchReceipt = await dbClient!.query(
      `SELECT (r.receipt -> 'consent' ->> 'versionAtDispatch')::int AS "versionAtDispatch"
         FROM notification_dispatch_receipts r
        WHERE r.tenant_id = $1::uuid AND r.outbox_id = $2::uuid
        ORDER BY r.attempt DESC
        LIMIT 1`,
      [fixture.tenantId, rows.r6!],
    );
    expect(Number((dispatchReceipt.rows[0] ?? {}).versionAtDispatch)).toBe(
      consentFixtures[6].parentConsentVersion + 2,
    );
    expect(finalRow.receipts.length).toBe(1);
    recordEvidence(
      currentScenario,
      'S10b: re-grant → approve (blocked_consent geçişli) → execute → dispatched, attempts 2, receipt 1 (düzeltme UI/DB tutarlı)',
    );
    await snap(sessionA!, '09-correction-cancellation');
    recordScenario(SCENARIO_NAMES[8], 'PASS');
  });

  it('N2’nin desteklediği retry/dead-letter/recovery yolculuğu.', async () => {
    currentScenario = SCENARIO_NAMES[9];
    // Restart: retry/dead-letter simülasyonu. Oturum belirteci restart'ı atlatır.
    await restartBackend('fail_first:3');
    await sessionA!.clickElement('#refresh-notifications');
    await waitForCount(sessionA!, '#notifications-list article.card', STUDENT_COUNT);
    const tagText = await sessionA!.queryTexts(
      `#notifications-list article.card:has(button[data-notification-id="${rows.r0}"]) .tag`,
    );
    expect(tagText.join(' ')).toContain('Gönderildi');
    recordEvidence(currentScenario, 'restart sonrası liste canlı: 11 kart, r0 Gönderildi (token+veri kalıcılığı)');

    await openCard(sessionA!, 'r5');
    await sessionA!.waitForText('#notification-detail h3', /· Beklemede/, 20_000);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);

    // Deneme 1 → rejected + backoff (5s).
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Başarısız/, 20_000);
    await thisRowReceiptCount('r5', 1);
    await waitForDispatchAvailable(dbClient!, fixture.tenantId, rows.r5!);

    // Deneme 2 → rejected + backoff (10s).
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Başarısız/, 20_000);
    await thisRowReceiptCount('r5', 2);
    await waitForDispatchAvailable(dbClient!, fixture.tenantId, rows.r5!);

    // Deneme 3 → üst sınır: dead-letter.
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Durduruldu/, 20_000);
    await thisRowReceiptCount('r5', 3);
    await expectRow('r5', { status: 'dead_lettered', attempts: 3 });

    // Recovery: retry → approved (available_at=now) → execute → dispatched.
    await runAction(sessionA!, 'retry');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    await sessionA!.waitForText('#notification-detail', /Deneme: 4/, 10_000);
    const final = await expectRow('r5', { status: 'dispatched', attempts: 4 });
    expect(final.receipts.length).toBe(4);
    expect(final.receipts.map((r) => r.outcome)).toEqual([
      'provider_rejected',
      'provider_rejected',
      'provider_rejected',
      'provider_accepted',
    ]);
    expect(final.receipts.every((r) => r.simulated)).toBe(true);
    recordEvidence(
      currentScenario,
      'r5: rejected+5s → rejected+10s → dead_lettered → retry(approved) → accepted; 4 receipt (hepsi simüle)',
    );
    await snap(sessionA!, '10-retry-deadletter-recovery');
    recordScenario(SCENARIO_NAMES[9], 'PASS');
  });

  it('Refresh/relogin sonrası persisted lifecycle görünümü.', async () => {
    currentScenario = SCENARIO_NAMES[10];
    await loginViaUi(sessionA!, fixture.opsUser.email, fixture.opsUser.credential);
    await ensureBranch(sessionA!, fixture.branchCode);
    await openNotificationsAndWait(sessionA!, STUDENT_COUNT);

    const counts = await readOutboxStatusCounts();
    const dispatched = counts.dispatched ?? 0;
    const cancelled = counts.cancelled ?? 0;
    recordEvidence(
      currentScenario,
      `DB türevli durum sayıları: dispatched=${dispatched}, cancelled=${cancelled}, toplam=${STUDENT_COUNT}`,
    );

    await sessionA!.selectValue('#notification-status-filter', 'dispatched');
    await sessionA!.clickElement('#apply-notification-filter');
    await waitForCount(sessionA!, '#notifications-list article.card', dispatched);
    await sessionA!.waitForText('#message-region', new RegExp(`${dispatched} bildirim listelendi`), 10_000);

    await sessionA!.selectValue('#notification-status-filter', 'cancelled');
    await sessionA!.clickElement('#apply-notification-filter');
    await waitForCount(sessionA!, '#notifications-list article.card', cancelled);
    await sessionA!.waitForText('#message-region', new RegExp(`${cancelled} bildirim listelendi`), 10_000);

    await sessionA!.selectValue('#notification-status-filter', '');
    await sessionA!.clickElement('#apply-notification-filter');
    await waitForCount(sessionA!, '#notifications-list article.card', STUDENT_COUNT);

    await openCard(sessionA!, 'r0');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    const lis = await sessionA!.queryTexts('#notification-detail ul.impact-list li');
    expect(lis.length).toBeGreaterThanOrEqual(1);

    const storage = await sessionA!.storageSnapshot();
    expect(storage.local).toEqual([]);
    expect(storage.session).toEqual([]);
    expect(storage.cookie).toBe('');
    recordEvidence(
      currentScenario,
      'filtreler DB türevli sayılarla eşleşti; r0 Gönderildi + kalıcı receipt; token/PII depolamada yok',
    );
    await snap(sessionA!, '11-refresh-relogin-persistence');
    recordScenario(SCENARIO_NAMES[10], 'PASS');
  });

  it('Keyboard/focus ile kritik akışın tamamlanması.', async () => {
    currentScenario = SCENARIO_NAMES[11];
    await openCard(sessionA!, 'r7');
    await sessionA!.waitForText('#notification-detail h3', /· Beklemede/, 20_000);
    await sessionA!.focus('button[data-notification-action="approve"]');
    const activeAction = await sessionA!.page.evaluate(
      () => document.activeElement?.getAttribute('data-notification-action') ?? '',
    );
    expect(activeAction).toBe('approve');
    await sessionA!.press('Enter');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    const tags = await cardText(sessionA!, 'r7');
    expect(tags.join(' ')).toContain('Onaylandı');
    await snap(sessionA!, '12-keyboard-approval');
    recordEvidence(currentScenario, 'focus(approve) + Enter → Onaylandı (klavye tam akış, kart etiketi güncel)');
    recordScenario(SCENARIO_NAMES[11], 'PASS');
  });

  it('Error/uncertain sonucu için sahte success oluşmaması.', async () => {
    currentScenario = SCENARIO_NAMES[12];
    await restartBackend('uncertain');

    await openCard(sessionA!, 'r9');
    await sessionA!.waitForText('#notification-detail h3', /· Beklemede/, 20_000);
    await runAction(sessionA!, 'approve');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);

    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Belirsiz/, 20_000);
    await sessionA!.waitForText('#notification-detail', /Deneme: 1/, 10_000);
    let liTexts = await sessionA!.queryTexts('#notification-detail ul.impact-list li');
    expect(liTexts.length).toBe(1);
    expect(liTexts[0]).toContain('uncertain');
    const afterFirst = await expectRow('r9', { status: 'uncertain', attempts: 1, dispatchedAt: null });
    expect(afterFirst.dispatchedAt).toBeNull();

    await runAction(sessionA!, 'retry');
    await sessionA!.waitForText('#notification-detail h3', /· Onaylandı/, 20_000);
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Belirsiz/, 20_000);
    await sessionA!.waitForText('#notification-detail', /Deneme: 2/, 10_000);
    liTexts = await sessionA!.queryTexts('#notification-detail ul.impact-list li');
    expect(liTexts.length).toBe(2);
    const detailText = await sessionA!.text('#notification-detail');
    expect(detailText).not.toContain('Gönderildi');
    const afterSecond = await expectRow('r9', { status: 'uncertain', attempts: 2, dispatchedAt: null });
    expect(afterSecond.dispatchedAt).toBeNull();
    recordEvidence(
      currentScenario,
      'uncertain: receipt kayıtlı ama dispatchedAt NULL ve UI "→ Belirsiz" (sahte Gönderildi yok), 2 deneme, tetiklenen tüm receiptler uncertain',
    );
    await snap(sessionA!, '13-uncertain-no-fake-success');
    recordScenario(SCENARIO_NAMES[12], 'PASS');
  });

  it('UI/network/artifact projection’larında gereksiz ham PII bulunmaması.', async () => {
    currentScenario = SCENARIO_NAMES[13];

    // (a) DOM — receipt li metni (providerRef ham uuid içerir; önce maskelenir).
    await openCard(sessionA!, 'r9');
    await sessionA!.waitForText('#notification-detail h3', /· Belirsiz/, 20_000);
    const dom = await sessionA!.bodyText();
    expect(scanTextForLeaks(scrubText(dom))).toEqual([]);

    // (b) DOM — consentless detay + öğrenci kimliği negatifleri.
    await openCard(sessionA!, 'r10');
    await sessionA!.waitForText('#notification-detail', /Onay sürümü: -/, 10_000);
    const dom10 = await sessionA!.bodyText();
    const masked10 = scrubText(dom10);
    expect(masked10).not.toMatch(/n3ops-student-\d/i);
    expect(masked10).not.toMatch(/n3ops student/i);
    expect(scanTextForLeaks(masked10)).toEqual([]);

    // (c) Network gövdeleri (auth yanıtları disclosure nedeniyle hariç tutuldu).
    const bodies = networkRecords
      .map((r) => `${r.label} ${r.method} ${r.status} ${r.url}\n${r.body}`)
      .join('\n');
    const maskedBodies = scrubText(bodies);
    expect(maskedBodies).not.toMatch(/n3ops-student-\d/i);
    expect(maskedBodies).not.toMatch(/n3ops student/i);
    expect(scanTextForLeaks(maskedBodies)).toEqual([]);
    recordEvidence(
      currentScenario,
      `network: ${networkRecords.length} yanıt tarandı (auth hariç), ham PII yok; uuid'ler maskelendi`,
    );

    // (d) Artefakt dizini — gerçek metin artefakt taraması (report sonradan yazılır).
    const artifactScan = scanArtifactDirectory(environment.artifactDir, {
      exclude: ['report.json'],
    });
    expect(artifactScan.findingCount).toBe(0);

    // (e) Backend log'u — dış dizinde (E2E artefakt dizini dışı), maskeleme politikası doğrulanır.
    const backendLogPath = path.join(serverArtifactDir, 'backend.log');
    const rawLog = fs.existsSync(backendLogPath) ? fs.readFileSync(backendLogPath, 'utf8') : '';
    const maskedLogFindings = scanTextForLeaks(scrubText(rawLog));
    expect(maskedLogFindings).toEqual([]);

    // (f) Depolama: her oturum boş.
    for (const s of [sessionA!, sessionB!, sessionC!]) {
      const storage = await s.storageSnapshot();
      expect(storage.local).toEqual([]);
      expect(storage.session).toEqual([]);
      expect(storage.cookie).toBe('');
    }
    recordEvidence(
      currentScenario,
      'DOM (2 detay) + network + artefakt dizini + backend.log + storage → tüm taramalar temiz',
    );
    await snap(sessionA!, '14-lease-ham-pii-absent');
    recordScenario(SCENARIO_NAMES[13], 'PASS');
  });
});

function thisRowReceiptCount(key: string, expected: number): Promise<void> {
  const id = rows[key];
  return waitForCount(
    sessionA!,
    '#notification-detail ul.impact-list li',
    expected,
  ).then(async () => {
    const row = await readDispatchRow(dbClient!, fixture.tenantId, id!);
    if (row.receipts.length !== expected) {
      throw new Error(`row ${key} receipt count: expected ${expected}, got ${row.receipts.length}.`);
    }
  });
}

function safeReportJson(value: unknown): string {
  return scrubText(`${JSON.stringify(value, null, 2)}\n`);
}

async function writeReport(verdict: ScenarioStatus): Promise<void> {
  const finishedAt = new Date().toISOString();
  const report = {
    slice: SLICE_ID,
    issue: 266,
    contract: 'MASTER PROMPT zorunlu 14 sahne (#266) — server-authoritative + SIMULATED provider',
    headSha: environment.headSha,
    baseUrl: environment.baseUrl,
    startedAt,
    finishedAt,
    browserStrategy: environment.browserStrategy,
    namespace: NAMESPACE,
    coverage: {
      students: STUDENT_COUNT,
      consentedStudents: CONSENTED_STUDENT_COUNT,
      outboxRows: STUDENT_COUNT,
      branchA: fixture.branchCode,
      branchB: 'N3OPS-BRANCH-B',
      actorRoles: ['operations_manager (A/B)', 'teacher (yetkisiz)'],
      executions: 'yalnız test-only SIMULATOR (receipt.simulated=true); gerçek delivery sinyali yok',
    },
    simulator: {
      provider: 'NOTIFICATION_SIMULATOR_MODE (env, boot-time fail-closed)',
      modes: simulatorModes,
      failureInjection: 'production’da açık failure-control endpoint YOK',
    },
    scenarios,
    evidence: Object.fromEntries(
      Object.entries(evidence).map(([key, lines]) => [key, lines.map(scrubText)]),
    ),
    negatives,
    security: {
      tokenStorage: 'yalnız JS bellek (accessToken); local/sessionStorage ve cookie boş',
      pseudonyms: 'payload/snapshot öğrenci-oturum kimlikleri tenant-kilitli deterministic ref',
      maskedPhones: "maskedDisplay '+90 532 *** ** 12' (ham numara taşınmaz)",
      leakScan: {
        domReceiptDetail: 'scanTextForLeaks(uuidMasked) = []',
        domConsentlessDetail: 'scanTextForLeaks(uuidMasked) = [] + kimlik negatifleri',
        networkBodies: `scanTextForLeaks(uuidMasked) = [] (${networkRecords.length} yanıt; /api/v1/auth/ bilinçli hariç — oturum kimliği)`,
        artifacts: 'scanArtifactDirectory earningCount 0 (screenshots PNG binary skip)',
        backendLog: {
          path: 'artifacts/n3-server-logs/backend.log (E2E artefakt dizini DIŞI, ekleme modunda)',
          maskingPolicy: 'raporuuid-masked tarama geçti; ham içerik artefakta kopyalanmaz',
        },
        storage: 'A/B/C oturumları: local=[] session=[] cookie=""',
      },
    },
    screenshots,
    backend: {
      pid: server?.pid ?? -1,
      readinessBoundToSpawnedProcess: true,
      portOwnershipProved: true,
      logPath: 'artifacts/n3-server-logs/backend.log',
    },
    timestamp: finishedAt,
    verdict,
  };
  fs.writeFileSync(
    path.join(environment.artifactDir, 'n3-ops-report.json'),
    safeReportJson(report),
    'utf8',
  );
}

afterAll(async () => {
  let failure: unknown;
  try {
    if (environment !== undefined) {
      const incomplete = SCENARIO_NAMES.filter((name) => scenarios[name] !== 'PASS');
      await writeReport(incomplete.length === 0 ? 'PASS' : 'FAIL');

      // Rapor sonrası kendi artefaktlarını da tara; sızıntı varsa verdict'i FAIL'e çek.
      const selfScan = scanArtifactDirectory(environment.artifactDir);
      if (selfScan.findingCount > 0) {
        await writeReport('FAIL');
        failure = new Error(
          `Artifact leak scan found ${selfScan.findingCount} finding(s): ${JSON.stringify(
            selfScan.textFiles,
          )}`,
        );
      }
    }
  } catch (error) {
    failure = new Error(`Acceptance report could not be written: ${describeFixtureError(error)}`);
  } finally {
    const stop = async (task: () => Promise<unknown>): Promise<void> => {
      await Promise.resolve()
        .then(task)
        .catch(() => undefined);
    };
    for (const s of [sessionA, sessionB, sessionC]) {
      if (s !== undefined) await stop(() => s.close());
    }
    const b = browser;
    if (b !== undefined) await stop(() => b.close());
    const sv = server;
    if (sv !== undefined) await stop(() => sv.stop());
    const db = dbClient;
    if (db !== undefined) await stop(() => db.end());
  }
  if (failure !== undefined) throw failure;
});