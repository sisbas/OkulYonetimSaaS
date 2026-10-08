import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';
import {
  createUiSession,
  launchE2eBrowser,
  PHONE_LEAK_PATTERN,
  scanTextForLeaks,
  type UiSession,
} from './support/browser';
import { scanArtifactDirectory } from './support/artifact-scan';
import { readE2eEnvironment, type E2eEnvironment } from './support/env';
import { createPgClient, type PgClient } from './support/pg-client';
import {
  describeFixtureError,
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
  loginForBootstrap,
  readDispatchRow,
  readOutboxIdsBySession,
  selectBranchForBootstrap,
  type BootstrapApi,
} from './support/notification-preconditions';
import { startRuntimeServer, type RuntimeServer } from './support/runtime-server';

/**
 * Stage 5 — E1 (MASTER PROMPT): full-journey kabul spec'i.
 *
 * Diğer Stage 5 kabul denyelerinden farkı: program çizelgesi API bootstrap ile
 * HAZIR VERİLMEZ; çizelge TAMAMEN runtime UI'dan oluşturulur ve yayınlanır.
 * Akmış zincir:
 *   program taslak/yayın (UI) → öğretmen izni (UI) → ops onayı (UI) → etki (UI)
 *   → aday atama/temizle (UI) → yoklama aç/işaretle/kilitle (UI) → oturum-level
 *   toplu onay (UI) → SIMULATED gönderim → durable receipt → KVKK onay geri çekme
 *   (UI) → enqueue/execute-time yeniden doğrulama reddi → izolasyon → kalıcılık
 *   → PII/depolama taraması.
 *
 * Sözleşme kuralları (bk. N3-A1 spec'i):
 * - İş sonucu tablolarına SQL ile ASLA yazılmaz; UI/API üretir, spec salt-okunur kanıt okur.
 * - `teacherBranchId` (olay satırındaki şube UUID'si) guard tarafından YENİDEN YAZILMAZ;
 *   operatör tarafından sağlanmalıdır (fixture.teacherBranchId).
 * - Legacy `body.branchId' = şube KODU` gönderilir; PermissionGuard (session adayında)
 *   kodu çözüp UUID ile ezer — schedule DB satırında UUID varlığı bunu kanıtlar.
 * - Yedek öğretmen YALNIZ referans tablolarına (users/tenant_memberships/user_roles/
 *   teachers/teacher_branches/teacher_courses) seed edilir; önkoşul verisidir.
 * - Provider etkisi yalnız test-only SIMULATOR'dur.
 * - KVKK: her DOM/network/artefakt taramasından ÖNCE uuid maskelemesi yapılır.
 */
jest.setTimeout(900_000);

const SLICE_ID = 'S5-E1';
const NAMESPACE = 's5';
const STUDENT_COUNT = 3;

type ScenarioStatus = 'PASS' | 'FAIL';

const scenarios: Record<string, ScenarioStatus> = {};

function recordScenario(name: string, status: ScenarioStatus): void {
  scenarios[name] = status;
}

const SCENARIO_NAMES = [
  'Program çizelgesi taslak → doğrulama → yayın (tamamen UI; branch code body).',
  'Öğretmen izni → ops onayı → etki → uygun aday ataması → temizleme (tamamen UI).',
  'Yoklama oturumu aç → kayıt işaretle → kilitle → devamsızlık kuyruğu (UI).',
  'Oturum düzeyinde toplu onay + SIMULATED gönderim + durable receipt (tek efekt).',
  'UI KVKK onay geri çekme + enqueue/execute yeniden doğrulama reddi.',
  'İzolasyon + yeniden giriş kalıcılığı + ham PII/depolama taraması.',
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

/** İzin/yoklama günleri için gerçek "gelecek Pazartesi" (UTC) tarihi üretir. */
function nextMonday(weeksAhead: number): string {
  const today = new Date();
  const day = today.getUTCDay();
  let delta = (1 - day + 7) % 7;
  if (delta === 0) delta = 7;
  return isoDay(delta + weeksAhead * 7);
}

let environment: E2eEnvironment;
let serverArtifactDir: string;
let fixture: ReferenceFixture;
let branchB: { branchId: string; branchCode: string };
let students: ReadonlyArray<StudentFixture>;
let consentFixtures: ReadonlyArray<ConsentFixture>;
let substituteTeacherId: string;
let server: RuntimeServer | undefined;
let browser: Browser | undefined;
let sessionA: UiSession | undefined;
let sessionB: UiSession | undefined;
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

let scheduleId = '';
let scheduleEventId = '';
let leaveId = '';
let session1Id = '';
let session2Id = '';

const attendanceMonday = nextMonday(1);
const leaveMonday = nextMonday(2);
const session2Date = isoDay(daysUntil(attendanceMonday) + 1);

function daysUntil(dateIso: string): number {
  const target = new Date(`${dateIso}T00:00:00Z`).getTime();
  const nowMs = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  return Math.round((target - nowMs) / 86_400_000);
}

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
      const record: NetworkRecord = { label, method: response.request().method(), status: response.status(), url, body };
      if (networkRecords.length >= 1200) networkRecords.shift();
      networkRecords.push(record);
    } catch {
      // Yanıt gövdesi okunamıyorsa kayıt atlanır.
    }
  });
}

function recordEvidence(key: string, line: string): void {
  (evidence[key] ??= []).push(line);
}

let currentScenario = '';

/** Son eşleşen /api/v1 yanıtlarının durum+gövde dökümü (create/leave başarısızlık tanısı). */
function networkTail(label: string, urlPattern: RegExp, limit = 6): string {
  const matching = networkRecords
    .filter((r) => r.label === label && urlPattern.test(r.url))
    .slice(-limit);
  if (matching.length === 0) return 'net: eşleşen /api/v1 yanıtı yok';
  return matching
    .map((r) => `${r.method} ${r.url.replace(/^.*\/api\/v1/, '/api/v1')} -> ${r.status}\n${r.body.slice(0, 600)}`)
    .join('\n---\n');
}

/** Exact-count yerine alt sınır bekler — aynı fresh DB'yi paylaşan ancak bu spec'ten
 * ÖNCE koşan suite'lerin (N3) ürettiği kalıntı satırlar toplamı yukarı çeker. */
async function waitForCountAtLeast(
  session: UiSession,
  selector: string,
  minimum: number,
  timeoutMs = 30_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    last = await session.countElements(selector).catch(() => -1);
    if (last >= minimum) return last;
    await sleep(200);
  }
  throw new Error(`waitForCountAtLeast timeout: ${selector} expected >= ${minimum}, last ${last}.`);
}

async function textOf(session: UiSession, selector: string): Promise<string> {
  return session.text(selector).catch(() => '?');
}

/** Öznenin geri çekilebilir (approved) onay butonlarını hedefler — branch-toplamına değil özneye odaklı. */
function revokeSelector(sid: string): string {
  return `#consents-output button[data-action="consent-revoke"][data-subject-ref-id="${sid}"]`;
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

/** Liste yeniden render'ı sırasında kopan tıklamaları toleranslı hale getirir. */
async function clickRetry(session: UiSession, selector: string, attempts = 5, delayMs = 400): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await session.clickElement(selector);
      return;
    } catch (error) {
      last = error;
      await sleep(delayMs);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Adım başarısında UI + ağ durumunu kanıtlayıp hatayı zenginleştirerek yeniden fırlatır. */
async function rethrowWithDiag(
  error: unknown,
  scenario: string,
  parts: ReadonlyArray<readonly [string, () => Promise<string> | string]>,
): Promise<never> {
  const lines = [`step-error: ${error instanceof Error ? error.message : String(error)}`];
  for (const [label, read] of parts) {
    try {
      const value = await read();
      lines.push(`${label}=${value.slice(0, 600)}`);
    } catch {
      lines.push(`${label}=?`);
    }
  }
  recordEvidence(scenario, lines.join('\n'));
  throw new Error(lines.join('\n'));
}

/** announce, listenin yenilenmesiyle ezilebilir → kalıcı kaynak DB kararıdır. */
async function waitForLeaveDecision(leaveId: string, status: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const row = await readLeave(leaveId).catch(() => null);
    last = String(row?.decisionStatus ?? '');
    if (last === status) return;
    await sleep(300);
  }
  throw new Error(`waitForLeaveDecision timeout: ${leaveId} expected ${status}, last=${last || 'okunamadi'}`);
}

/** Toplu onay announce'ı da ezilebilir → dispatch satırı kalıcı kaynaktır. */
async function waitForDispatchStatus(key: string, status: string, timeoutMs = 20_000): Promise<void> {
  const id = rows[key];
  if (!id) throw new Error(`No outbox id for row ${key}.`);
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const row = await readDispatchRow(dbClient!, fixture.tenantId, id).catch(() => null);
    last = String(row?.status ?? '');
    if (last === status) return;
    await sleep(300);
  }
  throw new Error(`waitForDispatchStatus timeout: ${key} expected ${status}, last=${last || 'okunamadi'}`);
}

/** revoke announce'ı liste-yenilemeyle ezilebilir → onay satırı kalıcı kaynaktır. */
async function waitForConsentStatus(
  studentId: string,
  consentType: string,
  status: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const row = await readLatestConsent(studentId, consentType).catch(() => null);
    last = String(row?.status ?? '');
    if (last === status) return;
    await sleep(300);
  }
  throw new Error(`waitForConsentStatus timeout: ${studentId}/${consentType} expected ${status}, last=${last || 'okunamadi'}`);
}

async function openCard(session: UiSession, key: string): Promise<void> {
  const id = rows[key];
  if (!id) throw new Error(`No outbox id for row ${key}.`);
  await session.clickElement(`button[data-action="notification-detail"][data-notification-id="${id}"]`);
}

function detailHeading(session: UiSession): Promise<string> {
  return session.waitForText('#notification-detail h3', /./, 20_000);
}

async function runAction(session: UiSession, action: string): Promise<void> {
  await session.clickElement(`button[data-notification-action="${action}"]`);
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
        throw new Error(`status mismatch for ${method} ${path}: expected ${status}, got ${error.status}.`);
      }
      if (messageContains !== undefined && !error.bodyText.toUpperCase().includes(messageContains.toUpperCase())) {
        throw new Error(
          `message mismatch for ${method} ${path}: expected to contain ${messageContains}, got ${scrubText(error.bodyText)}.`,
        );
      }
      recordEvidence(currentScenario, `${method} ${path} → HTTP ${status} (${messageContains ?? 'flat'})`);
      return;
    }
    throw error;
  }
}

async function submitBranchSelection(session: UiSession, code: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await session.selectValue('#branch-id', code);
    } catch {
      await sleep(250);
      continue;
    }
    const ready = await session.page
      .evaluate((branchCode: string) => {
        const select = document.querySelector<HTMLSelectElement>('#branch-id');
        const form = document.querySelector<HTMLFormElement>('#context-form');
        return Boolean(select && form && select.value === branchCode && form.checkValidity());
      }, code)
      .catch(() => false);
    if (!ready) {
      await sleep(250);
      continue;
    }
    await session.submitForm('#context-form');
    return;
  }
}

async function ensureBranch(session: UiSession, code: string): Promise<void> {
  await session.waitForText('#summary-scope', /./, 20_000);
  const scope = await session.text('#summary-scope');
  if (scope.includes(code)) return;
  await submitBranchSelection(session, code);
  const pattern = new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const deadline = Date.now() + 20_000;
  let last = '';
  while (Date.now() < deadline) {
    last = await session.text('#summary-scope');
    if (pattern.test(last)) return;
    await sleep(150);
  }
  const queueText = await session.text('#queue-output').catch(() => '');
  const messageText = await session.text('#message-region').catch(() => '');
  throw new Error(
    `Branch '${code}' did not become active (scope="${last}" queue="${queueText}" message="${messageText}").`,
  );
}

async function snap(session: UiSession, name: string): Promise<void> {
  await session.maskCredentialInputs().catch(() => undefined);
  screenshots.push(await session.screenshot(name));
}

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

async function submitContextDate(session: UiSession, date: string): Promise<void> {
  await fillField(session, '#operation-date', date);
}

/**
 * Form alanını verilen değerle DOLDURUR (mevcut metni EZER).
 * `typeInto` ekler; önceden değer bulunan alanlar (ör. tekrar üretimde
 * #attendance-student-ids) için kaçınılmazdır.
 */
async function fillField(session: UiSession, selector: string, value: string): Promise<void> {
  await session.page.evaluate(
    (sel: string, v: string) => {
      const element = document.querySelector(sel);
      if (element === null) throw new Error(`fillField: ${sel} bulunamadı.`);
      (element as HTMLInputElement).value = v;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    },
    selector,
    value,
  );
}

/** Oluşturulan yoklama oturumunun id'sini DB'den doğrular (DOM id okuması yok). */
async function readLatestSessionIdByDate(sessionDate: string): Promise<string> {
  const result = await dbClient!.query(
    `SELECT id::text AS id
       FROM attendance_sessions
      WHERE tenant_id = $1::uuid AND branch_id = $2::uuid AND session_date = $3::date
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [fixture.tenantId, fixture.branchId, sessionDate],
  );
  const row = result.rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error(`yoklama oturumu bulunamadı: ${sessionDate}`);
  return row.id;
}

async function readScheduleRow(): Promise<{
  branchId: string;
  revision: number;
  status: string;
}> {
  const result = await dbClient!.query(
    `SELECT branch_id::text AS branch_id, revision::int AS revision, status
       FROM schedules
      WHERE tenant_id = $1::uuid AND branch_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    [fixture.tenantId, fixture.branchId],
  );
  const row = result.rows[0] as { branch_id: string; revision: number; status: string } | undefined;
  if (row === undefined) throw new Error('schedule not found for branch');
  return { branchId: row.branch_id, revision: row.revision, status: row.status };
}

async function readLatestVersionStatus(): Promise<{
  versionNo: number;
  status: string;
  validatedRevision: number | null;
}> {
  const result = await dbClient!.query(
    `SELECT version_no::int AS version_no, status, validated_revision::int AS validated_revision
       FROM schedule_versions
      WHERE tenant_id = $1::uuid AND schedule_id = $2::uuid
      ORDER BY version_no DESC
      LIMIT 1`,
    [fixture.tenantId, scheduleId],
  );
  const row = result.rows[0] as { version_no: number; status: string; validated_revision: number | null };
  return { versionNo: row.version_no, status: row.status, validatedRevision: row.validated_revision };
}

async function readScheduleEvents(): Promise<Array<Record<string, string | number>>> {
  const result = await dbClient!.query(
    `SELECT id::text AS id, teacher_id::text AS teacher_id, teacher_branch_id::text AS teacher_branch_id,
            day_of_week::int AS day_of_week, start_time::text AS start_time, end_time::text AS end_time
       FROM schedule_events
      WHERE tenant_id = $1::uuid AND branch_id = $2::uuid
      ORDER BY created_at ASC`,
    [fixture.tenantId, fixture.branchId],
  );
  return result.rows as Array<Record<string, string | number>>;
}

async function readLeave(id: string): Promise<{ decisionStatus: string; coverageStatus: string; version: number }> {
  const result = await dbClient!.query(
    `SELECT decision_status, coverage_status, version::int AS version
       FROM leave_requests
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [fixture.tenantId, id],
  );
  const row = result.rows[0] as { decision_status: string; coverage_status: string; version: number };
  return { decisionStatus: row.decision_status, coverageStatus: row.coverage_status, version: row.version };
}

async function readAssignment(): Promise<{ substituteTeacherId: string; state: string } | null> {
  const result = await dbClient!.query(
    `SELECT substitute_teacher_id::text AS substitute_teacher_id, state
       FROM leave_substitution_assignments
      WHERE tenant_id = $1::uuid AND leave_request_id = $2::uuid AND schedule_event_id = $3::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    [fixture.tenantId, leaveId, scheduleEventId],
  );
  const row = result.rows[0] as { substitute_teacher_id: string; state: string } | undefined;
  return row === undefined
    ? null
    : { substituteTeacherId: row.substitute_teacher_id, state: row.state };
}

async function readAttendanceSession(sessionId: string): Promise<{ status: string; sessionDate: string }> {
  const result = await dbClient!.query(
    `SELECT status, session_date::text AS session_date
       FROM attendance_sessions
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [fixture.tenantId, sessionId],
  );
  const row = result.rows[0] as { status: string; session_date: string };
  return { status: row.status, sessionDate: row.session_date };
}

async function readAttendanceRecordCount(sessionId: string): Promise<number> {
  const result = await dbClient!.query(
    `SELECT COUNT(*)::int AS count FROM attendance_records
      WHERE tenant_id = $1::uuid AND session_id = $2::uuid`,
    [fixture.tenantId, sessionId],
  );
  return Number((result.rows[0] ?? {}).count ?? 0);
}

async function readLatestConsent(studentId: string, consentType: string): Promise<{
  version: number;
  status: string;
  revokedAt: unknown;
}> {
  const result = await dbClient!.query(
    `SELECT version::int AS version, status, revoked_at
       FROM kvkk_consents
      WHERE tenant_id = $1::uuid AND subject_id = $2::uuid AND consent_type = $3
      ORDER BY version DESC, created_at DESC, id DESC
      LIMIT 1`,
    [fixture.tenantId, studentId, consentType],
  );
  const row = result.rows[0] as { version: number; status: string; revoked_at: unknown };
  return { version: row.version, status: row.status, revokedAt: row.revoked_at };
}

/**
 * Uygun yedek öğretmen önkoşulu (yalnız referans tabloları; iş sonucu değildir).
 * Deterministik/idempotent: select-first, gerekirse insert.
 */
async function seedSubstituteTeacher(client: PgClient): Promise<string> {
  const email = `sub.${NAMESPACE}@qa.invalid`;
  const userResult = await client.query(`SELECT id::text AS id FROM users WHERE email = $1`, [email]);
  let userId = userResult.rows[0]?.id as string | undefined;
  if (userId === undefined) {
    const inserted = await client.query(
      `INSERT INTO users (email, credential_hash, full_name, status, token_version)
       VALUES ($1, $2, $3, 'active', 1)
       RETURNING id::text AS id`,
      [email, '$2b$10$INVALID_HASH_S5_SUBSTITUTE_NEVER_LOGINS', `${NAMESPACE} substitute`],
    );
    userId = inserted.rows[0].id as string;
  }

  await client.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, status)
     VALUES ($1::uuid, $2::uuid, 'active')
     ON CONFLICT DO NOTHING`,
    [fixture.tenantId, userId],
  );

  const roleResult = await client.query(
    `SELECT id::text AS id FROM roles WHERE tenant_id = $1::uuid AND name = 'teacher' AND deleted_at IS NULL LIMIT 1`,
    [fixture.tenantId],
  );
  const roleId = roleResult.rows[0]?.id as string | undefined;
  if (roleId !== undefined) {
    await client.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [fixture.tenantId, userId, roleId],
    );
  }

  const teacherResult = await client.query(
    `SELECT id::text AS id FROM teachers WHERE tenant_id = $1::uuid AND employee_code = $2`,
    [fixture.tenantId, `${NAMESPACE}-sub`],
  );
  let teacherId = teacherResult.rows[0]?.id as string | undefined;
  if (teacherId === undefined) {
    const inserted = await client.query(
      `INSERT INTO teachers (tenant_id, user_id, employee_code, first_name, last_name, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'substitute', 'active')
       RETURNING id::text AS id`,
      [fixture.tenantId, userId, `${NAMESPACE}-sub`, NAMESPACE],
    );
    teacherId = inserted.rows[0].id as string;
  }

  const branchResult = await client.query(
    `SELECT id::text AS id FROM teacher_branches
      WHERE tenant_id = $1::uuid AND teacher_id = $2::uuid AND branch_id = $3::uuid AND status = 'active'`,
    [fixture.tenantId, teacherId, fixture.branchId],
  );
  if (branchResult.rows[0]?.id === undefined) {
    await client.query(
      `INSERT INTO teacher_branches (tenant_id, teacher_id, branch_id, status, effective_from, effective_to)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)`,
      [fixture.tenantId, teacherId, fixture.branchId],
    );
  }

  const courseResult = await client.query(
    `SELECT id::text AS id FROM teacher_courses
      WHERE tenant_id = $1::uuid AND teacher_id = $2::uuid AND course_id = $3::uuid AND status = 'active'
        AND effective_to IS NULL`,
    [fixture.tenantId, teacherId, fixture.courseId],
  );
  if (courseResult.rows[0]?.id === undefined) {
    await client.query(
      `INSERT INTO teacher_courses (tenant_id, teacher_id, course_id, status, effective_from, effective_to)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)`,
      [fixture.tenantId, teacherId, fixture.courseId],
    );
  }

  return teacherId;
}

beforeAll(async () => {
  environment = readE2eEnvironment();
  startedAt = new Date().toISOString();
  fs.mkdirSync(path.join(environment.artifactDir, 'screenshots', 's5'), { recursive: true });
  serverArtifactDir = path.join(environment.artifactDir, '..', 's5-server-logs');
  fs.mkdirSync(serverArtifactDir, { recursive: true });

  dbClient = createPgClient(environment.databaseUrl);
  await dbClient.connect();

  fixture = await seedReferenceFixtures(dbClient, {
    tenantSlug: environment.seedTenantSlug,
    credential: environment.fixtureCredential,
    namespace: NAMESPACE,
  });
  branchB = await seedAdditionalBranch(dbClient, {
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
    students,
    namespace: NAMESPACE,
  });
  substituteTeacherId = await seedSubstituteTeacher(dbClient);

  server = await startRuntimeServer({
    baseUrl: environment.baseUrl,
    port: environment.port,
    artifactDir: serverArtifactDir,
    env: { NOTIFICATION_SIMULATOR_MODE: 'accept' },
  });
  simulatorModes.push('accept');

  const tokenA = await loginForBootstrap(environment.baseUrl, fixture.opsUser.email, fixture.opsUser.credential);
  opsApi = { baseUrl: environment.baseUrl, token: tokenA, branchCode: fixture.branchCode };
  await selectBranchForBootstrap(opsApi, { branchName: `${NAMESPACE} reference branch`, branchCode: fixture.branchCode });

  const tokenB = await loginForBootstrap(environment.baseUrl, fixture.opsUser.email, fixture.opsUser.credential);
  opsApiB = { baseUrl: environment.baseUrl, token: tokenB, branchCode: branchB.branchCode };
  await selectBranchForBootstrap(opsApiB, { branchName: `${NAMESPACE} secondary branch`, branchCode: branchB.branchCode });

  const teacherToken = await loginForBootstrap(environment.baseUrl, fixture.teacherUser.email, fixture.teacherUser.credential);
  teacherApi = { baseUrl: environment.baseUrl, token: teacherToken, branchCode: fixture.branchCode };
  await selectBranchForBootstrap(teacherApi, { branchName: `${NAMESPACE} reference branch`, branchCode: fixture.branchCode });

  browser = await launchE2eBrowser();
  const screenshotDir = path.join(environment.artifactDir, 'screenshots', 's5');
  sessionA = await createUiSession({ browser, baseUrl: environment.baseUrl, screenshotDir, index: screenshotIndex });
  attachNetworkRecorder(sessionA, 'opsA');
  sessionB = await createUiSession({ browser, baseUrl: environment.baseUrl, screenshotDir, index: screenshotIndex });
  attachNetworkRecorder(sessionB, 'teacher');
});

describe('S5-E1 acceptance — Stage 5 full journey (UI-driven schedule → leave → attendance → notifications)', () => {
  it('Program çizelgesi taslak → doğrulama → yayın (tamamen UI; branch code body).', async () => {
    currentScenario = SCENARIO_NAMES[0];
    await loginViaUi(sessionA!, fixture.opsUser.email, fixture.opsUser.credential);
    await submitContextDate(sessionA!, leaveMonday);
    await ensureBranch(sessionA!, fixture.branchCode);

    await sessionA!.clickElement('.tab[data-tab="program"]');
    await sessionA!.typeInto('#schedule-branch', fixture.branchCode);
    await fillField(sessionA!, '#schedule-effective-from', isoDay(-30));
    await sessionA!.submitForm('#schedule-create-form');
    try {
      await sessionA!.waitForText('#schedule-status h3', /Çizelge hazır/, 20_000);
    } catch (error) {
      const detail = [
        `scope=${await textOf(sessionA!, '#summary-scope')}`,
        `status=${(await textOf(sessionA!, '#schedule-status')).slice(0, 600)}`,
        `message=${(await textOf(sessionA!, '#message-region')).slice(0, 400)}`,
        `branchField=${await textOf(sessionA!, '#schedule-branch')}`,
        networkTail('opsA', /\/(schedules|context\/branch)(\/|$)/),
      ].join('\n');
      recordEvidence(currentScenario, detail);
      throw new Error(`schedule create did not render 'Çizelge hazır'.\n${detail}`);
    }
    await sessionA!.waitForText('#schedule-status', /Revizyon: 1/, 10_000);
    scheduleId = (await sessionA!.text('#schedule-status'))
      .match(/Kimlik: ([0-9a-f-]{36})/)?.[1] ?? '';
    if (!scheduleId) throw new Error('schedule id not rendered in #schedule-status');

    let created = await readScheduleRow();
    expect(created.status).toBe('draft');
    expect(created.revision).toBe(1);
    expect(created.branchId).toBe(fixture.branchId);
    recordEvidence(currentScenario, 'POST /schedules: body.branchId=kod → guard UUID yeniden yazması kanıtı (DB branch_id UUID)');

    await sessionA!.clickElement('#add-schedule-event');
    const row = (index: string, field: string): string =>
      `#schedule-events [data-schedule-row="${index}"] [data-schedule-field="${field}"]`;
    await fillField(sessionA!, row('0', 'teacherId'), fixture.teacherId);
    await fillField(sessionA!, row('0', 'teacherBranchId'), fixture.teacherBranchId);
    await fillField(sessionA!, row('0', 'studentGroupId'), fixture.studentGroupId);
    await fillField(sessionA!, row('0', 'courseId'), fixture.courseId);
    await fillField(sessionA!, row('0', 'roomId'), fixture.roomId);
    await fillField(sessionA!, row('0', 'timeSlotId'), fixture.timeSlotId);
    await fillField(sessionA!, row('0', 'dayOfWeek'), '1');
    await fillField(sessionA!, row('0', 'startTime'), '10:00');
    await fillField(sessionA!, row('0', 'endTime'), '11:00');
    await sessionA!.clickElement('button[data-action="schedule-row-update"]');

    await sessionA!.clickElement('#save-schedule-draft');
    try {
      await sessionA!.waitForText('#schedule-status', /Revizyon: 2/, 20_000);
    } catch (error) {
      await rethrowWithDiag(error, currentScenario, [
        ['status', () => textOf(sessionA!, '#schedule-status')],
        ['message', () => textOf(sessionA!, '#message-region')],
        ['dayField', () => textOf(sessionA!, row('0', 'dayOfWeek'))],
        ['net', () => networkTail('opsA', /\/schedules\//)],
      ]);
    }
    recordEvidence(currentScenario, 'draft: revision 1 → 2 (state.scheduleRevision sunucu yanıtı + draft +1)');

    await sessionA!.clickElement('#validate-schedule');
    try {
      await sessionA!.waitForText('#schedule-status', /Yayınlanabilir: Evet/, 20_000);
      await sessionA!.waitForText('#message-region', /Doğrulama geçti/, 10_000);
    } catch (error) {
      await rethrowWithDiag(error, currentScenario, [
        ['status', () => textOf(sessionA!, '#schedule-status')],
        ['message', () => textOf(sessionA!, '#message-region')],
        ['net', () => networkTail('opsA', /\/schedules\//)],
      ]);
    }

    await sessionA!.clickElement('#publish-schedule');
    try {
      await sessionA!.waitForText('#schedule-status', /Çizelge hazır/, 20_000);
      await sessionA!.waitForText('#message-region', /Çizelge yayınlandı/, 10_000);
    } catch (error) {
      await rethrowWithDiag(error, currentScenario, [
        ['status', () => textOf(sessionA!, '#schedule-status')],
        ['message', () => textOf(sessionA!, '#message-region')],
        ['net', () => networkTail('opsA', /\/schedules\//)],
      ]);
    }

    created = await readScheduleRow();
    expect(created.revision).toBe(2);
    const version = await readLatestVersionStatus();
    expect(version.status).toBe('published');
    expect(version.versionNo).toBe(1);
    expect(version.validatedRevision).toBe(2);
    recordEvidence(currentScenario, 'publish: revision 2, schedule_versions published v1 (validatedRevision 2)');

    const events = await readScheduleEvents();
    expect(events.length).toBe(1);
    scheduleEventId = String(events[0].id);
    expect(events[0].teacherId).toBe(fixture.teacherId);
    expect(events[0].teacherBranchId).toBe(fixture.teacherBranchId);
    expect(events[0].dayOfWeek).toBe(1);
    expect(String(events[0].startTime)).toContain('10:00');
    expect(String(events[0].endTime)).toContain('11:00');
    recordEvidence(currentScenario, 'event day=1 10:00-11:00, ref IDs UUID (teacherBranchId guard tarafından dokunulmadı)');
    await snap(sessionA!, '01-schedule-published-ui');
    recordScenario(SCENARIO_NAMES[0], 'PASS');
  });

  it('Öğretmen izni → ops onayı → etki → uygun aday ataması → temizleme (tamamen UI).', async () => {
    currentScenario = SCENARIO_NAMES[1];
    await loginViaUi(sessionB!, fixture.teacherUser.email, fixture.teacherUser.credential);
    await submitContextDate(sessionB!, leaveMonday);
    await ensureBranch(sessionB!, fixture.branchCode);

    await sessionB!.selectValue('#leave-duration-type', 'full_day');
    await sessionB!.selectValue('#leave-reason-code', 'health');
    await fillField(sessionB!, '#leave-starts-at', `${leaveMonday}T08:00`);
    await fillField(sessionB!, '#leave-ends-at', `${leaveMonday}T18:00`);
    await sessionB!.submitForm('#leave-form');
    try {
      await sessionB!.waitForText('#teacher-output', /Beklemede|İzin/, 20_000);
    } catch (error) {
      const detail = [
        `scope=${await textOf(sessionB!, '#summary-scope')}`,
        `output=${(await textOf(sessionB!, '#teacher-output')).slice(0, 600)}`,
        `message=${(await textOf(sessionB!, '#message-region')).slice(0, 400)}`,
        networkTail('teacher', /\/(leaves|context\/branch)(\/|$)/),
      ].join('\n');
      recordEvidence(currentScenario, detail);
      throw new Error(`teacher leave did not render in #teacher-output.\n${detail}`);
    }
    await sessionB!.waitForText('#message-region', /İzin talebi oluşturuldu|kaydedildi/i, 10_000).catch(() => undefined);
    recordEvidence(currentScenario, `teacher UI: izin ${leaveMonday} 08:00-18:00 (full_day/health) kaydedildi`);

    await sessionA!.clickElement('#refresh-leaves');
    await waitForCountAtLeast(sessionA!, '#leaves-output article.card', 1);
    await sessionA!.waitForText('#leaves-output', /Beklemede/, 10_000);
    leaveId = (await sessionA!.attribute('#leaves-output button[data-leave-decision="approve"]', 'data-leave-id')) ?? '';
    if (!leaveId) throw new Error('leave id not captured from approve button');
    await clickRetry(sessionA!, '#leaves-output button[data-leave-decision="approve"]');
    try {
      await waitForLeaveDecision(leaveId, 'approved');
    } catch (error) {
      await rethrowWithDiag(error, currentScenario, [
        ['message', () => textOf(sessionA!, '#message-region')],
        ['output', () => textOf(sessionA!, '#leaves-output')],
        ['net', () => networkTail('opsA', /\/leaves\//)],
      ]);
    }
    await sessionA!.waitForText('#leaves-output', /Onaylandı/, 10_000);
    let leave = await readLeave(leaveId);
    expect(leave.decisionStatus).toBe('approved');
    expect(leave.coverageStatus).toBe('unresolved');
    recordEvidence(currentScenario, 'ops UI onay → DB approved, coverage unresolved (etki açık)');

    await sessionA!.clickElement('#refresh-queue');
    await sessionA!.waitForText('#queue-output', new RegExp(leaveMonday), 20_000);
    await sessionA!.waitForText(`#queue-output button[data-action="impact"][data-leave-id="${leaveId}"]`, /./, 20_000);
    await sessionA!.clickElement(`#queue-output button[data-action="impact"][data-leave-id="${leaveId}"]`);
    await sessionA!.waitForText('#impact-output', /ders etkileniyor/, 20_000);
    await sessionA!.waitForText('#impact-output', new RegExp(leaveMonday), 10_000);

    await sessionA!.clickElement('button[data-action="candidates"]');
    await sessionA!.waitForText('#candidate-output article.candidate', /(substitute|Seçilebilir aday)/i, 20_000);
    const candidateTags = await sessionA!.queryTexts('#candidate-output article.candidate .tag');
    expect(candidateTags.join(' ')).toContain('Seçilebilir aday');
    const assignDisabled = await sessionA!.attribute(
      '#candidate-output button[data-action="assign"]',
      'disabled',
    ).catch(() => null);
    expect(assignDisabled).toBeNull();
    recordEvidence(currentScenario, 'substitute aday UI: uygun + assign aktif (teacher_branches/teacher_courses seed)');

    await sessionA!.clickElement('#candidate-output button[data-action="assign"]');
    await sessionA!.waitForText('#message-region', /Görevlendirme kaydedildi/, 20_000);
    let assignment = await readAssignment();
    expect(assignment).not.toBeNull();
    expect(assignment!.substituteTeacherId).toBe(substituteTeacherId);
    expect(assignment!.state).toBe('assigned');
    leave = await readLeave(leaveId);
    expect(leave.coverageStatus).toBe('covered');
    recordEvidence(currentScenario, 'assign → DB state=assigned, coverage covered, substitute=seed teacher');

    await sessionA!.clickElement('#candidate-output button[data-action="clear"]');
    await sessionA!.waitForText('#message-region', /Görevlendirme temizlendi/, 20_000);
    assignment = await readAssignment();
    expect(assignment).not.toBeNull();
    expect(assignment!.state).toBe('cleared');
    leave = await readLeave(leaveId);
    expect(leave.coverageStatus).toBe('unresolved');
    recordEvidence(currentScenario, 'clear → DB state=cleared, coverage unresolved (günlük iş tekrar açık)');
    await snap(sessionA!, '02-leave-assign-clear');
    recordScenario(SCENARIO_NAMES[1], 'PASS');
  });

  it('Yoklama oturumu aç → kayıt işaretle → kilitle → devamsızlık kuyruğu (UI).', async () => {
    currentScenario = SCENARIO_NAMES[2];
    await sessionA!.clickElement('.tab[data-tab="attendance"]');
    await fillField(sessionA!, '#attendance-event-id', scheduleEventId);
    await fillField(sessionA!, '#attendance-session-date', attendanceMonday);
    await fillField(
      sessionA!,
      '#attendance-student-ids',
      students.map((student) => student.studentId).join(','),
    );
    await sessionA!.submitForm('#attendance-generate-form');
    try {
      await sessionA!.waitForText('#attendance-detail h3', /Yoklama · Yayınlandı/, 20_000);
    } catch (error) {
      await rethrowWithDiag(error, currentScenario, [
        ['detail', () => textOf(sessionA!, '#attendance-detail')],
        ['message', () => textOf(sessionA!, '#message-region')],
        ['eventIdField', () => textOf(sessionA!, '#attendance-event-id')],
        ['net', () => networkTail('opsA', /\/attendance\//)],
      ]);
    }
    session1Id = await readLatestSessionIdByDate(attendanceMonday);
    if (!session1Id) throw new Error('session1 id not captured');
    let session = await readAttendanceSession(session1Id);
    expect(session.status).toBe('published');
    expect(session.sessionDate).toBe(attendanceMonday);
    recordEvidence(currentScenario, `ops UI generate: session ${attendanceMonday} roster 3 → published`);

    await sessionB!.clickElement('.tab[data-tab="attendance"]');
    await sessionB!.clickElement('#refresh-attendance');
    await sessionB!.clickElement(`button[data-action="attendance-open"][data-session-id="${session1Id}"]`);
    await sessionB!.waitForText('#attendance-detail h3', /Yoklama/, 20_000);
    await sessionB!.clickElement(
      `button[data-action="attendance-mark"][data-student-id="${students[0].studentId}"][data-mark="absent"]`,
    );
    await sessionB!.clickElement(
      `button[data-action="attendance-mark"][data-student-id="${students[1].studentId}"][data-mark="present"]`,
    );
    await sessionB!.clickElement(
      `button[data-action="attendance-mark"][data-student-id="${students[2].studentId}"][data-mark="absent"]`,
    );
    await sessionB!.waitForText('#attendance-detail', /Yoklama · Yayınlandı/, 20_000);
    const recordCount = await readAttendanceRecordCount(session1Id);
    expect(recordCount).toBe(STUDENT_COUNT);
    recordEvidence(currentScenario, 'teacher UI: 3 kayıt işaretlendi (absent/present/absent)');

    await sessionA!.clickElement('#refresh-attendance');
    await sessionA!.clickElement(`button[data-action="attendance-open"][data-session-id="${session1Id}"]`);
    await sessionA!.waitForText('#attendance-detail h3', /Yoklama · Yayınlandı/, 20_000);
    await sessionA!.clickElement('button[data-action="attendance-lock"]');
    await sessionA!.waitForText('#attendance-detail h3', /Yoklama · Kilitli/, 20_000);
    session = await readAttendanceSession(session1Id);
    expect(session.status).toBe('locked');

    const outboxMap = await readOutboxIdsBySession(dbClient!, fixture.tenantId, session1Id);
    expect(Object.keys(outboxMap)).toHaveLength(2);
    expect(outboxMap[students[0].studentId]).toBeDefined();
    expect(outboxMap[students[1].studentId]).toBeUndefined();
    expect(outboxMap[students[2].studentId]).toBeDefined();
    rows.r0 = outboxMap[students[0].studentId];
    rows.r1 = outboxMap[students[2].studentId];
    recordEvidence(currentScenario, 'lock → 2 devamsızlık outbox row (students[0], students[2]); sunucu üretti');
    await snap(sessionA!, '03-attendance-locked-outbox');
    recordScenario(SCENARIO_NAMES[2], 'PASS');
  });

  it('Oturum düzeyinde toplu onay + SIMULATED gönderim + durable receipt (tek efekt).', async () => {
    currentScenario = SCENARIO_NAMES[3];
    await sessionA!.clickElement('.tab[data-tab="notifications"]');
    await sessionA!.clickElement('#refresh-notifications');
    await waitForCountAtLeast(sessionA!, '#notifications-list article.card', 2);
    recordEvidence(currentScenario, 'notifications list renderme: >= 2 kart (N3 kalıntıları nedeniyle tam sayı yerine alt sınır)');
    await sessionA!.waitForText('#bulk-approve-output button[data-action="bulk-approve-session"]', /toplu onayla/i, 10_000);
    await sessionA!.clickElement('#bulk-approve-output button[data-action="bulk-approve-session"]');
    try {
      await waitForDispatchStatus('r0', 'approved');
      await waitForDispatchStatus('r1', 'approved');
    } catch (error) {
      await rethrowWithDiag(error, currentScenario, [
        ['message', () => textOf(sessionA!, '#message-region')],
        ['bulk', () => textOf(sessionA!, '#bulk-approve-output')],
        ['net', () => networkTail('opsA', /\/notifications\/drafts\//)],
      ]);
    }
    await expectRow('r0', { status: 'approved', version: 1, attempts: 0 });
    await expectRow('r1', { status: 'approved', version: 1, attempts: 0 });
    recordEvidence(currentScenario, 'session-level bulk approve → her iki draft approved v1 (tek istek)');

    await openCard(sessionA!, 'r0');
    await detailHeading(sessionA!);
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    const liTexts0 = await sessionA!.queryTexts('#notification-detail ul.impact-list li');
    expect(liTexts0.length).toBe(1);
    expect(liTexts0[0]).toContain('provider_accepted');
    expect(liTexts0[0]).toContain('simüle');
    const row0 = await expectRow('r0', {
      status: 'dispatched',
      attempts: 1,
      dispatchedAt: expect.any(String) as unknown as string | null,
      receipts: [expect.any(Object) as unknown as ReadonlyArray<unknown>],
    });
    const receipt0 = row0.receipts[0];
    expect(receipt0.outcome).toBe('provider_accepted');
    expect(receipt0.simulated).toBe(true);
    expect(receipt0.providerRef).toMatch(/^sim:/);

    await openCard(sessionA!, 'r1');
    await detailHeading(sessionA!);
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    const row1 = await expectRow('r1', {
      status: 'dispatched',
      attempts: 1,
      dispatchedAt: expect.any(String) as unknown as string | null,
      receipts: [expect.any(Object) as unknown as ReadonlyArray<unknown>],
    });
    expect(row1.receipts[0].providerRef).toMatch(/^sim:/);

    // Duplicate click → tek business effect.
    await runAction(sessionA!, 'execute');
    await sessionA!.waitForText('#notification-detail h3', /· Gönderildi/, 20_000);
    const afterDup = await expectRow('r1', { status: 'dispatched', attempts: 1 });
    expect(afterDup.receipts.length).toBe(1);
    const second = await apiCall(opsApi, 'POST', `/notifications/${rows.r1}/execute`);
    const secondJson = second.json as { idempotent?: boolean; status?: string };
    expect(secondJson.idempotent).toBe(true);
    expect(secondJson.status).toBe('dispatched');
    const afterLoss = await expectRow('r1', { status: 'dispatched', attempts: 1 });
    expect(afterLoss.receipts.length).toBe(1);

    negatives['dup-execute'] = 'aynı execute iki kez → idempotent 200, attempts 1, receipt 1';
    recordEvidence(currentScenario, 'SIMULATED execute → dispatched; receipt provider_accepted/simüle/sim:... ↔ DB birebir; dup idempotent');
    await snap(sessionA!, '04-bulk-approved-simulated-dispatched');
    recordScenario(SCENARIO_NAMES[3], 'PASS');
  });

  it('UI KVKK onay geri çekme + enqueue/execute yeniden doğrulama reddi.', async () => {
    currentScenario = SCENARIO_NAMES[4];
    await sessionA!.clickElement('.tab[data-tab="notifications"]');
    await sessionA!.clickElement('#refresh-consents');
    const studentForRevoke = students[2].studentId;
    await waitForCount(sessionA!, revokeSelector(studentForRevoke), 2);
    for (const consentType of ['parent_notification', 'sms_notification']) {
      await clickRetry(
        sessionA!,
        `button[data-action="consent-revoke"][data-subject-ref-id="${studentForRevoke}"][data-consent-type="${consentType}"]`,
      );
      try {
        await waitForConsentStatus(studentForRevoke, consentType, 'revoked');
      } catch (error) {
        await rethrowWithDiag(error, currentScenario, [
          ['message', () => textOf(sessionA!, '#message-region')],
          ['consents', () => textOf(sessionA!, '#consents-output')],
          ['net', () => networkTail('opsA', /\/consents\//)],
        ]);
      }
      const consent = await readLatestConsent(studentForRevoke, consentType);
      expect(consent.status).toBe('revoked');
      expect(consent.revokedAt).not.toBeNull();
    }
    recordEvidence(currentScenario, 'UI consent tab → her iki kanal revoke edildi (DB revoked + revoked_at)');

    await sessionA!.clickElement('.tab[data-tab="attendance"]');
    await fillField(sessionA!, '#attendance-event-id', scheduleEventId);
    await fillField(sessionA!, '#attendance-session-date', session2Date);
    await fillField(sessionA!, '#attendance-student-ids', studentForRevoke);
    await sessionA!.submitForm('#attendance-generate-form');
    try {
      await sessionA!.waitForText('#attendance-detail h3', /Yoklama · Yayınlandı/, 20_000);
    } catch (error) {
      await rethrowWithDiag(error, currentScenario, [
        ['detail', () => textOf(sessionA!, '#attendance-detail')],
        ['message', () => textOf(sessionA!, '#message-region')],
        ['eventIdField', () => textOf(sessionA!, '#attendance-event-id')],
        ['net', () => networkTail('opsA', /\/attendance\//)],
      ]);
    }
    session2Id = await readLatestSessionIdByDate(session2Date);
    if (!session2Id) throw new Error('session2 id not captured');

    await sessionB!.clickElement('.tab[data-tab="attendance"]');
    await sessionB!.clickElement('#refresh-attendance');
    const session2Button = `button[data-action="attendance-open"][data-session-id="${session2Id}"]`;
    await sessionB!.clickElement(session2Button);
    await sessionB!.waitForText('#attendance-detail h3', /Yoklama/, 20_000);
    await sessionB!.clickElement(
      `button[data-action="attendance-mark"][data-student-id="${studentForRevoke}"][data-mark="absent"]`,
    );

    await sessionA!.clickElement('#refresh-attendance');
    await sessionA!.clickElement(session2Button);
    await sessionA!.waitForText('#attendance-detail h3', /Yoklama · Yayınlandı/, 20_000);
    await sessionA!.clickElement('button[data-action="attendance-lock"]');
    await sessionA!.waitForText('#attendance-detail h3', /Yoklama · Kilitli/, 20_000);

    const outboxMap2 = await readOutboxIdsBySession(dbClient!, fixture.tenantId, session2Id);
    expect(Object.keys(outboxMap2)).toHaveLength(1);
    rows.r2 = outboxMap2[studentForRevoke];
    await expectRow('r2', { status: 'blocked_consent', attempts: 0, consentVersion: null, dispatchedAt: null, receipts: [] });
    recordEvidence(currentScenario, 'lock → enqueue-time yeniden doğrulama: revoked onay → blocked_consent, consentVersion yok');

    await sessionA!.clickElement('.tab[data-tab="notifications"]');
    await sessionA!.clickElement('#refresh-notifications');
    await waitForCountAtLeast(sessionA!, '#notifications-list article.card', 3);
    await openCard(sessionA!, 'r2');
    const heading = await detailHeading(sessionA!);
    expect(heading).toContain('· Onay engelli');
    await sessionA!.waitForText('#notification-detail', /Onay sürümü: -/, 10_000);

    await expectApiError(opsApi, 'POST', `/notifications/${rows.r2}/execute`, 409, 'NOT_DISPATCHABLE');
    await expectRow('r2', { status: 'blocked_consent', attempts: 0, dispatchedAt: null, receipts: [] });
    negatives['blocked-execute'] = 'blocked_consent (enqueue-time) execute → 409 NOT_DISPATCHABLE, sıfır efekt';
    recordEvidence(currentScenario, 'execute reddi + DB değişmedi (attempts 0, receipt yok)');
    await snap(sessionA!, '05-consent-revoke-blocked');
    recordScenario(SCENARIO_NAMES[4], 'PASS');
  });

  it('İzolasyon + yeniden giriş kalıcılığı + ham PII/depolama taraması.', async () => {
    currentScenario = SCENARIO_NAMES[5];
    // İzolasyon: ikincil şube ve yetkisiz rol üzerinden hiçbir sızıntı yok.
    const branchBSchedules = await dbClient!.query(
      `SELECT COUNT(*)::int AS count FROM schedules WHERE tenant_id = $1::uuid AND branch_id = $2::uuid`,
      [fixture.tenantId, branchB.branchId],
    );
    expect(Number((branchBSchedules.rows[0] ?? {}).count ?? 0)).toBe(0);
    const queueB = await apiCall(opsApiB, 'GET', `/daily-operations/today?branchId=${branchB.branchCode}&date=${leaveMonday}`);
    expect((queueB.json as { items?: unknown[] }).items ?? []).toEqual([]);
    const listB = await apiCall(opsApiB, 'GET', '/notifications?limit=20&offset=0');
    expect((listB.json as { notifications?: unknown[] }).notifications ?? []).toEqual([]);
    await expectApiError(teacherApi, 'GET', '/notifications?limit=20&offset=0', 403, 'Forbidden');
    recordEvidence(currentScenario, 'izolasyon: B şubesi schedule=0, today=[], notifications=[]; teacher 403');

    // Yeniden giriş: kalıcı iş sonuçları UI'da aynı (sunucu-otoriter kaynak).
    await loginViaUi(sessionA!, fixture.opsUser.email, fixture.opsUser.credential);
    await submitContextDate(sessionA!, attendanceMonday);
    await ensureBranch(sessionA!, fixture.branchCode);
    await sessionA!.clickElement('.tab[data-tab="notifications"]');
    await sessionA!.clickElement('#refresh-notifications');
    await waitForCountAtLeast(sessionA!, '#notifications-list article.card', 3);
    const tags0 = await sessionA!.queryTexts(
      `#notifications-list article.card:has(button[data-notification-id="${rows.r0}"]) .tag`,
    );
    expect(tags0.join(' ')).toContain('Gönderildi');

    await sessionA!.clickElement('.tab[data-tab="attendance"]');
    await sessionA!.clickElement('#refresh-attendance');
    await waitForCountAtLeast(sessionA!, '#attendance-sessions article.card', 2);

    await sessionA!.clickElement('.tab[data-tab="notifications"]');
    await sessionA!.clickElement('#refresh-consents');
    await waitForCount(sessionA!, revokeSelector(students[0].studentId), 2);
    await waitForCount(sessionA!, revokeSelector(students[2].studentId), 0);
    const persistedConsents = await sessionA!.countElements('#consents-output article.card').catch(() => -1);
    recordEvidence(
      currentScenario,
      `relogin sonrası: notifications >=3 kart (Gönderildi dahil), attendance >=2 oturum, consents kart=${persistedConsents} (öznemiz: students[0] revoke 2, students[2] revoke 0) — kalıcılık`,
    );

    // PII taraması (DOM).
    await openCard(sessionA!, 'r0');
    await detailHeading(sessionA!);
    const dom = await sessionA!.bodyText();
    const maskedDom = scrubText(dom);
    expect(maskedDom).not.toMatch(/s5-student-\d/i);
    expect(maskedDom).not.toMatch(/s5 student/i);
    expect(scanTextForLeaks(maskedDom)).toEqual([]);

    // PII taraması (network; auth yanıtları hariç).
    const bodies = networkRecords
      .map((r) => `${r.label} ${r.method} ${r.status} ${r.url}\n${r.body}`)
      .join('\n');
    const maskedBodies = scrubText(bodies);
    expect(maskedBodies).not.toMatch(/s5-student-\d/i);
    const bodyLeaks = scanTextForLeaks(maskedBodies);
    if (bodyLeaks.length > 0) {
      const windows = Array.from(maskedBodies.matchAll(PHONE_LEAK_PATTERN))
        .slice(0, 5)
        .map((m) => {
          const start = Math.max(0, (m.index ?? 0) - 60);
          return `…${maskedBodies.slice(start, (m.index ?? 0) + 80)}…`;
        });
      throw new Error(`network body leak: ${bodyLeaks.join(', ')}\n${windows.join('\n---\n')}`);
    }
    expect(bodyLeaks).toEqual([]);

    // PII taraması (artefaktlar ve backend log'u).
    const artifactScan = scanArtifactDirectory(environment.artifactDir, { exclude: ['report.json', 'stage5-full-journey-report.json'] });
    expect(artifactScan.findingCount).toBe(0);
    const backendLogPath = path.join(serverArtifactDir, 'backend.log');
    const rawLog = fs.existsSync(backendLogPath) ? fs.readFileSync(backendLogPath, 'utf8') : '';
    expect(scanTextForLeaks(scrubText(rawLog))).toEqual([]);

    // Depolama boşluğu (token yalnız JS bellek).
    for (const s of [sessionA!, sessionB!]) {
      const storage = await s.storageSnapshot();
      expect(storage.local).toEqual([]);
      expect(storage.session).toEqual([]);
      expect(storage.cookie).toBe('');
    }
    negatives['storage-token'] = 'local/sessionStorage ve cookie boş; accessToken bellek içi';
    recordEvidence(currentScenario, 'DOM/network/artefakt/backend.log/storage taramaları temiz');
    await snap(sessionA!, '06-isolation-persistence-pii');
    recordScenario(SCENARIO_NAMES[5], 'PASS');
  });
});

function safeReportJson(value: unknown): string {
  return scrubText(`${JSON.stringify(value, null, 2)}\n`);
}

async function writeReport(verdict: ScenarioStatus): Promise<void> {
  const finishedAt = new Date().toISOString();
  const report = {
    slice: SLICE_ID,
    issue: 266,
    contract: 'Stage 5 — E1 full journey (UI-driven schedule → leave/approval/impact/assign/clear → attendance → notifications → consent)',
    headSha: environment.headSha,
    baseUrl: environment.baseUrl,
    startedAt,
    finishedAt,
    browserStrategy: environment.browserStrategy,
    namespace: NAMESPACE,
    coverage: {
      students: STUDENT_COUNT,
      consents: STUDENT_COUNT * 2,
      schedule: { branchBody: 'branch code (guard → UUID rewrite, DB kanıtı)', revision: 2, eventDay: 1, time: '10:00-11:00' },
      attendance: { session1Date: attendanceMonday, session2Date: session2Date, marks: 'absent/present/absent', outbox: 2 },
      leave: { window: leaveMonday, decision: 'approved', coverageAfterAssign: 'covered', coverageAfterClear: 'unresolved' },
      actorRoles: ['operations_manager (A)', 'teacher (B)'],
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
      pseudonyms: 'öğrenci/oturum kimlikleri tenant-kilitli deterministic ref',
      maskedPhones: "maskedDisplay '+90 532 *** ** 12' (ham numara taşınmaz)",
      leakScan: {
        dom: 'scanTextForLeaks(uuidMasked) = [] + s5-student kimlik negatifleri',
        networkBodies: `scanTextForLeaks(uuidMasked) = [] (${networkRecords.length} yanıt; /api/v1/auth/ bilinçli hariç)`,
        artifacts: 'scanArtifactDirectory findingCount 0 (report hariç)',
        backendLog: 'masked scan = [] (E2E artefakt dizini DIŞI, ekleme modunda)',
        storage: 'A/B oturumları: local=[] session=[] cookie=""',
      },
    },
    screenshots,
    backend: {
      pid: server?.pid ?? -1,
      readinessBoundToSpawnedProcess: true,
      portOwnershipProved: true,
      logPath: 'artifacts/s5-server-logs/backend.log',
    },
    timestamp: finishedAt,
    verdict,
  };
  fs.writeFileSync(
    path.join(environment.artifactDir, 'stage5-full-journey-report.json'),
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
    for (const s of [sessionA, sessionB]) {
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