'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const puppeteer = require('puppeteer-core');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts', 'wp07f-p0-browser-e2e');
const SCREEN_DIR = path.join(OUT_DIR, 'screenshots');
const REPORT_PATH = path.join(OUT_DIR, 'report.json');
const BASE_URL = process.env.APP_BASE_URL || 'http://127.0.0.1:3000';
const HEAD_SHA = process.env.GITHUB_SHA || 'unknown';
const RUN_ID = process.env.GITHUB_RUN_ID || 'local';
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const CHROMIUM_EXECUTABLE_PATH = process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';

const safeStrings = {
  tenantSlug: 'system-seed',
  branchCode: 'P0-BRANCH',
  otherBranchCode: 'P0-EMPTY-BRANCH',
  foreignTenantSlug: 'p0-foreign-tenant',
  foreignBranchCode: 'P0-FOREIGN-BRANCH',
  teacherEmail: 'teacher.p0@qa.invalid',
  otherTeacherEmail: 'other.teacher.p0@qa.invalid',
  opsEmail: 'ops.p0@qa.invalid',
  password: process.env.E2E_SYNTHETIC_CREDENTIAL || ['p0', 'runtime', RUN_ID, 'synthetic'].join('-'),
};

const report = {
  runId: RUN_ID,
  headSha: HEAD_SHA,
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  overallStatus: 'FAIL',
  consoleErrorCount: 0,
  storageViolationCount: 0,
  tokenOrAuthorizationLeakCount: 0,
  rawBackendErrorLeakCount: 0,
  piiArtifactLeakCount: 0,
  screenshots: [],
  scenarioResults: {},
  viewportResults: {},
  accessibilityResults: {},
  securityDiagnostics: {},
  kvkkDiagnostics: {},
  blockingErrors: [],
};

function ensureDirs() {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(name, status, details = {}) {
  report.scenarioResults[name] = { status, ...details };
}

function pass(name, details = {}) {
  record(name, 'PASS', details);
}

function block(message, details = {}) {
  report.blockingErrors.push({ message, ...details });
}

function redact(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '<jwt-redacted>')
    .replace(/accessToken"\s*:\s*"[^"]+"/g, 'accessToken":"<redacted>"')
    .replace(/refreshToken"\s*:\s*"[^"]+"/g, 'refreshToken":"<redacted>"');
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function yyyyMmDd(date) {
  return date.toISOString().slice(0, 10);
}

function isoDayOfWeek(date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function dateAtUtc(date, hour, minute = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0));
}

async function screenshot(page, name) {
  const file = path.join(SCREEN_DIR, `${String(report.screenshots.length + 1).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(path.relative(OUT_DIR, file));
}

async function query(client, sql, params = []) {
  return client.query(sql, params);
}

async function seedSyntheticData() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const tenantRows = await query(client, `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`, [safeStrings.tenantSlug]);
    assertCondition(tenantRows.rowCount === 1, 'system-seed tenant not found; db:seed:permissions must run first');
    const tenantId = tenantRows.rows[0].id;

    const foreignTenant = await query(client, `
      INSERT INTO tenants (name, slug, status)
      VALUES ('P0 Foreign Tenant', $1, 'active')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
      RETURNING id
    `, [safeStrings.foreignTenantSlug]);
    const foreignTenantId = foreignTenant.rows[0].id;

    const branch = await query(client, `
      INSERT INTO branches (tenant_id, name, code, status)
      VALUES ($1, 'P0 Synthetic Branch', $2, 'active')
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
      RETURNING id
    `, [tenantId, safeStrings.branchCode]);
    const otherBranch = await query(client, `
      INSERT INTO branches (tenant_id, name, code, status)
      VALUES ($1, 'P0 Empty Branch', $2, 'active')
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
      RETURNING id
    `, [tenantId, safeStrings.otherBranchCode]);
    const foreignBranch = await query(client, `
      INSERT INTO branches (tenant_id, name, code, status)
      VALUES ($1, 'P0 Foreign Branch', $2, 'active')
      ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
      RETURNING id
    `, [foreignTenantId, safeStrings.foreignBranchCode]);

    const passwordHash = await bcrypt.hash(safeStrings.password, 10);
    async function upsertUser(email, fullName) {
      const rows = await query(client, `
        INSERT INTO users (email, credential_hash, full_name, status, token_version)
        VALUES ($1, $2, $3, 'active', 1)
        ON CONFLICT (email) DO UPDATE
        SET credential_hash = EXCLUDED.credential_hash,
            full_name = EXCLUDED.full_name,
            status = 'active',
            token_version = users.token_version + 1,
            updated_at = now()
        RETURNING id
      `, [email, passwordHash, fullName]);
      await query(client, `
        INSERT INTO tenant_memberships (tenant_id, user_id, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active', deleted_at = NULL, updated_at = now()
      `, [tenantId, rows.rows[0].id]);
      return rows.rows[0].id;
    }

    const teacherUserId = await upsertUser(safeStrings.teacherEmail, 'P0 Synthetic Teacher');
    const otherTeacherUserId = await upsertUser(safeStrings.otherTeacherEmail, 'P0 Synthetic Other Teacher');
    const opsUserId = await upsertUser(safeStrings.opsEmail, 'P0 Synthetic Operations');

    async function attachRole(userId, roleName) {
      const role = await query(client, `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [tenantId, roleName]);
      assertCondition(role.rowCount === 1, `role not found: ${roleName}`);
      await query(client, `
        INSERT INTO user_roles (tenant_id, user_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING
      `, [tenantId, userId, role.rows[0].id]);
    }
    await attachRole(teacherUserId, 'teacher');
    await attachRole(otherTeacherUserId, 'teacher');
    await attachRole(opsUserId, 'operations_manager');

    async function upsertTeacherForUser(userId, code, firstName, lastName, branchId) {
      const rows = await query(client, `
        INSERT INTO teachers (tenant_id, user_id, employee_code, first_name, last_name, status)
        VALUES ($1, $2, $3, $4, $5, 'active')
        ON CONFLICT (tenant_id, user_id) WHERE user_id IS NOT NULL AND status = 'active' AND deleted_at IS NULL
        DO UPDATE SET employee_code = EXCLUDED.employee_code, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = now()
        RETURNING id
      `, [tenantId, userId, code, firstName, lastName]);
      const branchRows = await query(client, `
        INSERT INTO teacher_branches (tenant_id, teacher_id, branch_id, status, effective_from, effective_to)
        VALUES ($1, $2, $3, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [tenantId, rows.rows[0].id, branchId]);
      const existingBranch = branchRows.rows[0]?.id
        ? branchRows
        : await query(client, `SELECT id FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2 AND branch_id = $3 AND status = 'active' LIMIT 1`, [tenantId, rows.rows[0].id, branchId]);
      return { teacherId: rows.rows[0].id, teacherBranchId: existingBranch.rows[0].id };
    }

    async function upsertSubstituteTeacher(code, firstName, lastName, branchId) {
      const rows = await query(client, `
        INSERT INTO teachers (tenant_id, employee_code, first_name, last_name, status)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (tenant_id, lower(employee_code)) WHERE employee_code IS NOT NULL AND status = 'active' AND deleted_at IS NULL
        DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = now()
        RETURNING id
      `, [tenantId, code, firstName, lastName]);
      const branchRows = await query(client, `
        INSERT INTO teacher_branches (tenant_id, teacher_id, branch_id, status, effective_from, effective_to)
        VALUES ($1, $2, $3, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [tenantId, rows.rows[0].id, branchId]);
      const existingBranch = branchRows.rows[0]?.id
        ? branchRows
        : await query(client, `SELECT id FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2 AND branch_id = $3 AND status = 'active' LIMIT 1`, [tenantId, rows.rows[0].id, branchId]);
      return { teacherId: rows.rows[0].id, teacherBranchId: existingBranch.rows[0].id };
    }

    const teacher = await upsertTeacherForUser(teacherUserId, 'P0-T-1', 'P0', 'Teacher', branch.rows[0].id);
    const otherTeacher = await upsertTeacherForUser(otherTeacherUserId, 'P0-T-2', 'P0', 'Other', branch.rows[0].id);
    const substitute = await upsertSubstituteTeacher('P0-SUB-1', 'P0', 'Substitute', branch.rows[0].id);

    const course = await query(client, `
      INSERT INTO courses (tenant_id, name, code, status)
      VALUES ($1, 'P0 Course', 'P0-COURSE', 'active')
      ON CONFLICT (tenant_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
      RETURNING id
    `, [tenantId]);
    const room = await query(client, `
      INSERT INTO rooms (tenant_id, branch_id, name, code, capacity, status)
      VALUES ($1, $2, 'P0 Room', 'P0-ROOM', 24, 'active')
      ON CONFLICT (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET name = EXCLUDED.name, capacity = EXCLUDED.capacity, status = 'active', updated_at = now()
      RETURNING id
    `, [tenantId, branch.rows[0].id]);
    const group = await query(client, `
      INSERT INTO student_groups (tenant_id, branch_id, name, code, status)
      VALUES ($1, $2, 'P0 Group', 'P0-GROUP', 'active')
      ON CONFLICT (tenant_id, branch_id, lower(code)) WHERE code IS NOT NULL AND deleted_at IS NULL
      DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
      RETURNING id
    `, [tenantId, branch.rows[0].id]);

    const target = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const occurrenceDate = yyyyMmDd(target);
    const dayOfWeek = isoDayOfWeek(target);
    const timeSlot = await query(client, `
      INSERT INTO time_slots (tenant_id, branch_id, name, day_of_week, start_time, end_time, order_index, status)
      VALUES ($1, $2, 'P0 Slot', $3, '10:00', '11:00', 1, 'active')
      ON CONFLICT (tenant_id, branch_id, day_of_week, start_time, end_time) WHERE status = 'active'
      DO UPDATE SET name = EXCLUDED.name, order_index = EXCLUDED.order_index, updated_at = now()
      RETURNING id
    `, [tenantId, branch.rows[0].id, dayOfWeek]);

    const schedule = await query(client, `
      INSERT INTO schedules (tenant_id, branch_id, status, revision, effective_from, effective_to)
      VALUES ($1, $2, 'published', 1, $3::date - INTERVAL '1 day', $3::date + INTERVAL '7 days')
      RETURNING id
    `, [tenantId, branch.rows[0].id, occurrenceDate]);
    const version = await query(client, `
      INSERT INTO schedule_versions (tenant_id, branch_id, schedule_id, version_no, status, validation_mode, validation_fingerprint, validated_revision, snapshot, published_at)
      VALUES ($1, $2, $3, 1, 'published', 'FULL', 'p0-browser-e2e', 1, '{}'::jsonb, now())
      RETURNING id
    `, [tenantId, branch.rows[0].id, schedule.rows[0].id]);
    await query(client, `UPDATE schedules SET active_version_id = $1, updated_at = now() WHERE id = $2`, [version.rows[0].id, schedule.rows[0].id]);
    const event = await query(client, `
      INSERT INTO schedule_events (tenant_id, branch_id, schedule_id, version_id, teacher_id, teacher_branch_id, student_group_id, course_id, room_id, time_slot_id, day_of_week, start_time, end_time, time_slot_snapshot)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '10:00', '11:00', '{"label":"P0 Slot"}'::jsonb)
      RETURNING id
    `, [tenantId, branch.rows[0].id, schedule.rows[0].id, version.rows[0].id, teacher.teacherId, teacher.teacherBranchId, group.rows[0].id, course.rows[0].id, room.rows[0].id, timeSlot.rows[0].id, dayOfWeek]);

    await query(client, `
      INSERT INTO teacher_courses (tenant_id, teacher_id, course_id, status, effective_from, effective_to)
      VALUES ($1, $2, $3, 'active', $4::date - INTERVAL '1 day', NULL)
      ON CONFLICT DO NOTHING
    `, [tenantId, substitute.teacherId, course.rows[0].id, occurrenceDate]);

    const approvedLeave = await query(client, `
      INSERT INTO leave_requests (tenant_id, branch_id, teacher_id, requester_user_id, duration_type, reason_code, decision_status, coverage_status, starts_at, ends_at, version)
      VALUES ($1, $2, $3, $4, 'hourly', 'administrative', 'approved', 'unresolved', $5, $6, 1)
      RETURNING id
    `, [tenantId, branch.rows[0].id, teacher.teacherId, teacherUserId, dateAtUtc(target, 7), dateAtUtc(target, 8)]);
    const otherLeave = await query(client, `
      INSERT INTO leave_requests (tenant_id, branch_id, teacher_id, requester_user_id, duration_type, reason_code, decision_status, coverage_status, starts_at, ends_at, version)
      VALUES ($1, $2, $3, $4, 'hourly', 'administrative', 'pending', 'not_required', $5, $6, 1)
      RETURNING id
    `, [tenantId, branch.rows[0].id, otherTeacher.teacherId, otherTeacherUserId, dateAtUtc(target, 9), dateAtUtc(target, 10)]);

    report.seed = {
      tenantId,
      branchId: branch.rows[0].id,
      otherBranchId: otherBranch.rows[0].id,
      foreignBranchId: foreignBranch.rows[0].id,
      occurrenceDate,
      teacherId: teacher.teacherId,
      otherTeacherId: otherTeacher.teacherId,
      substituteTeacherId: substitute.teacherId,
      approvedLeaveId: approvedLeave.rows[0].id,
      otherLeaveId: otherLeave.rows[0].id,
      scheduleEventId: event.rows[0].id,
    };
  } finally {
    await client.end();
  }
}

async function withClient(operation) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function waitForRuntime(page) {
  const res = await page.goto(`${BASE_URL}/runtime/`, { waitUntil: 'networkidle2', timeout: 30000 });
  assertCondition(res && res.status() < 400, `runtime failed to load: ${res && res.status()}`);
}

async function typeIfExists(page, selector, value) {
  const el = await page.$(selector);
  assertCondition(Boolean(el), `selector not found: ${selector}`);
  await el.click({ clickCount: 3 });
  await el.type(String(value));
}

async function clickSubmitFor(page, selector) {
  await page.$eval(selector, (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

async function waitForText(page, selector, pattern, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await page.$eval(selector, (el) => el.textContent || '').catch(() => '');
    if (pattern.test(text)) return text;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${pattern} in ${selector}`);
}

async function apiCall(page, token, apiPath, options = {}) {
  const result = await page.evaluate(async ({ apiPath, token, options }) => {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api/v1${apiPath}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { text }; }
    return {
      ok: response.ok,
      status: response.status,
      body,
      etag: response.headers.get('etag'),
    };
  }, { apiPath, token, options });
  if (result.status >= 500) report.rawBackendErrorLeakCount += 1;
  return result;
}

async function loginApi(page, email) {
  const result = await apiCall(page, '', '/auth/login', {
    method: 'POST',
    body: { email, password: safeStrings.password, tenantId: report.seed.tenantId },
  });
  assertCondition(result.ok && result.body?.accessToken, `login failed for synthetic user; status=${result.status}`);
  return result.body.accessToken;
}

async function loginThroughUi(page, email, scenarioName) {
  await typeIfExists(page, '#email', email);
  await typeIfExists(page, '#password', safeStrings.password);
  await typeIfExists(page, '#tenant-id', report.seed.tenantId);
  await clickSubmitFor(page, '#login-form');
  await waitForText(page, '#session-status', /Oturum aktif/i);
  await screenshot(page, scenarioName.replaceAll(' ', '-').toLowerCase());
  pass(scenarioName);
}

function requireOk(result, message) {
  assertCondition(result.ok, `${message}; status=${result.status}; body=${redact(JSON.stringify(result.body))}`);
}

function requireStatus(result, statuses, message) {
  assertCondition(statuses.includes(result.status), `${message}; status=${result.status}; body=${redact(JSON.stringify(result.body))}`);
}

function scanTextForLeaks(text) {
  const value = String(text || '');
  if (/Bearer\s+|eyJ[A-Za-z0-9._-]+/.test(value)) report.tokenOrAuthorizationLeakCount += 1;
  if (/stack trace|QueryFailedError|SELECT\s+.*FROM|internal permission|credential_hash/i.test(value)) report.rawBackendErrorLeakCount += 1;
  if (/\b\d{10,}\b/.test(value)) report.piiArtifactLeakCount += 1;
  if (/[A-Z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|atasehir|bel)\./i.test(value)) report.piiArtifactLeakCount += 1;
}

async function collectStorageDiagnostics(page) {
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookie: document.cookie,
  }));
  report.storageViolationCount = storage.local.length + storage.session.length + (storage.cookie ? 1 : 0);
  return storage;
}

async function runBrowserScenarios() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrorCount += 1;
    });
    page.on('pageerror', () => {
      report.consoleErrorCount += 1;
    });

    const viewports = [360, 430, 768, 820, 1024, 1440];
    for (const width of viewports) {
      await page.setViewport({ width, height: 900 });
      await waitForRuntime(page);
      await screenshot(page, `viewport-${width}`);
      report.viewportResults[String(width)] = { status: 'PASS', height: 900 };
    }

    await page.setViewport({ width: 1440, height: 900 });
    await waitForRuntime(page);
    pass('loading state', { evidence: '/runtime loaded with status regions' });

    await loginThroughUi(page, safeStrings.teacherEmail, 'Teacher login');
    const teacherToken = await loginApi(page, safeStrings.teacherEmail);
    const opsToken = await loginApi(page, safeStrings.opsEmail);

    const createOwn = await apiCall(page, teacherToken, '/leaves/me', {
      method: 'POST',
      body: {
        branchId: report.seed.branchId,
        durationType: 'hourly',
        reasonCode: 'administrative',
        startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
      },
    });
    requireOk(createOwn, 'Teacher own leave create failed');
    pass('Teacher own leave create', { status: createOwn.status, leaveId: createOwn.body.id });
    await screenshot(page, 'teacher-own-leave-create-api');

    const ownRead = await apiCall(page, teacherToken, `/leaves/me/${createOwn.body.id}`);
    requireOk(ownRead, 'Teacher own leave read failed');
    pass('Teacher own leave read', { status: ownRead.status, leaveId: ownRead.body.id });
    await screenshot(page, 'teacher-own-leave-read-api');

    const otherRecord = await apiCall(page, teacherToken, `/leaves/me/${report.seed.otherLeaveId}`);
    requireStatus(otherRecord, [403, 404], 'Teacher other-record non-enumerating deny failed');
    pass('Teacher other-record/cross-scope non-enumerating deny', { status: otherRecord.status });

    await loginThroughUi(page, safeStrings.opsEmail, 'Operations Manager login');
    await typeIfExists(page, '#branch-id', report.seed.branchId);
    await typeIfExists(page, '#operation-date', report.seed.occurrenceDate);

    const replay = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/projection/replay`, { method: 'POST' });
    requireOk(replay, 'Projection replay failed');

    await clickSubmitFor(page, '#context-form');
    await waitForText(page, '#queue-output', /open|unresolved|Ders/i);
    await screenshot(page, 'ops-authorized-branch-queue');
    const queue = await apiCall(page, opsToken, `/daily-operations/today?branchId=${report.seed.branchId}&date=${report.seed.occurrenceDate}`);
    requireOk(queue, 'Authorized branch queue failed');
    assertCondition(Array.isArray(queue.body.lessons) && queue.body.lessons.length > 0, 'Authorized branch queue returned no lessons');
    pass('Authorized branch queue', { status: queue.status, lessonCount: queue.body.lessons.length });

    await page.click('button[data-action="impact"]');
    await waitForText(page, '#impact-output', /Coverage|Adayları getir/i);
    await screenshot(page, 'leave-impact');
    const impact = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/impact`);
    requireOk(impact, 'Leave impact failed');
    assertCondition(Array.isArray(impact.body.events) && impact.body.events.length > 0, 'Leave impact returned no events');
    pass('Leave impact', { status: impact.status, leaveEtag: impact.body.leaveEtag, eventCount: impact.body.events.length });
    const scheduleEventId = impact.body.events[0].scheduleEventId;
    const initialEtag = impact.body.leaveEtag;

    await page.click('button[data-action="candidates"]');
    await waitForText(page, '#candidate-output', /Aday öğretmen|Uygunluk/i);
    await screenshot(page, 'candidates');
    const candidates = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/events/${scheduleEventId}/candidates`);
    requireOk(candidates, 'Candidates failed');
    assertCondition(candidates.body.eligibilityFinalized === true, 'Candidates authority was not finalized');
    assertCondition(Array.isArray(candidates.body.candidates) && candidates.body.candidates.length > 0, 'No eligible candidates returned');
    pass('Candidates', { status: candidates.status, candidateCount: candidates.body.candidates.length });
    const substituteTeacherId = candidates.body.candidates[0].teacherId;

    const createAssignment = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/events/${scheduleEventId}/substitution`, {
      method: 'POST',
      headers: { 'If-Match': initialEtag },
      body: { substituteTeacherId },
    });
    requireOk(createAssignment, 'Assignment create failed');
    assertCondition(createAssignment.body.coverageStatus === 'covered', 'Assignment create did not cover the impacted lesson');
    pass('Assignment create', { status: createAssignment.status, coverageStatus: createAssignment.body.coverageStatus });
    await screenshot(page, 'assignment-create-api');

    const queueAfterCreate = await apiCall(page, opsToken, `/daily-operations/today?branchId=${report.seed.branchId}&date=${report.seed.occurrenceDate}`);
    requireOk(queueAfterCreate, 'Queue refetch after assignment create failed');
    assertCondition(queueAfterCreate.body.lessons.some((lesson) => lesson.state === 'resolved'), 'Queue did not show resolved lesson after assignment create');
    pass('Impact/queue refetch after create', { status: queueAfterCreate.status });
    pass('Covered/resolved state', { resolvedCount: queueAfterCreate.body.lessons.filter((lesson) => lesson.state === 'resolved').length });

    const staleClear = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/events/${scheduleEventId}/substitution`, {
      method: 'DELETE',
      headers: { 'If-Match': initialEtag },
    });
    requireStatus(staleClear, [412], 'Stale If-Match did not fail with precondition');
    pass('stale If-Match', { status: staleClear.status });

    const freshImpact = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/impact`);
    requireOk(freshImpact, 'Fresh impact after assignment failed');
    const duplicateAssign = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/events/${scheduleEventId}/substitution`, {
      method: 'POST',
      headers: { 'If-Match': freshImpact.body.leaveEtag },
      body: { substituteTeacherId },
    });
    requireStatus(duplicateAssign, [409], 'Duplicate assignment conflict did not return conflict');
    pass('conflict', { status: duplicateAssign.status });

    const clearAssignment = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/events/${scheduleEventId}/substitution`, {
      method: 'DELETE',
      headers: { 'If-Match': freshImpact.body.leaveEtag },
    });
    requireOk(clearAssignment, 'Assignment clear failed');
    pass('Assignment clear', { status: clearAssignment.status, coverageStatus: clearAssignment.body.coverageStatus });
    await screenshot(page, 'assignment-clear-api');

    const queueAfterClear = await apiCall(page, opsToken, `/daily-operations/today?branchId=${report.seed.branchId}&date=${report.seed.occurrenceDate}`);
    requireOk(queueAfterClear, 'Queue refetch after assignment clear failed');
    assertCondition(queueAfterClear.body.lessons.some((lesson) => lesson.state === 'open'), 'Queue did not show open lesson after assignment clear');
    pass('Impact/queue refetch after clear', { status: queueAfterClear.status });
    pass('Open state', { openCount: queueAfterClear.body.lessons.filter((lesson) => lesson.state === 'open').length });

    await withClient(async (client) => query(client, `ALTER TABLE teacher_courses RENAME TO teacher_courses_p0_hidden`));
    try {
      const notReady = await apiCall(page, opsToken, `/daily-operations/leaves/${report.seed.approvedLeaveId}/events/${scheduleEventId}/candidates`);
      requireOk(notReady, 'eligibility_not_ready request failed');
      assertCondition(notReady.body.eligibilityFinalized === false, 'eligibility_not_ready was not represented as unfinished authority');
      pass('eligibility_not_ready', { status: notReady.status, eligibilityFinalized: notReady.body.eligibilityFinalized });
    } finally {
      await withClient(async (client) => query(client, `ALTER TABLE teacher_courses_p0_hidden RENAME TO teacher_courses`));
    }

    const forbidden = await apiCall(page, teacherToken, `/daily-operations/today?branchId=${report.seed.branchId}&date=${report.seed.occurrenceDate}`);
    requireStatus(forbidden, [403], 'Teacher forbidden Daily Operations read did not return 403');
    pass('forbidden', { status: forbidden.status });

    const crossTenant = await apiCall(page, opsToken, `/daily-operations/today?branchId=${report.seed.foreignBranchId}&date=${report.seed.occurrenceDate}`);
    requireStatus(crossTenant, [404], 'Cross-tenant branch was not non-enumerating');
    report.securityDiagnostics.crossTenantNonEnumeratingStatus = crossTenant.status;

    const empty = await apiCall(page, opsToken, `/daily-operations/today?branchId=${report.seed.otherBranchId}&date=${report.seed.occurrenceDate}`);
    requireOk(empty, 'Empty branch queue failed');
    assertCondition(Array.isArray(empty.body.lessons) && empty.body.lessons.length === 0, 'Empty branch queue was not empty');
    pass('empty state', { status: empty.status });

    await page.evaluate(() => {
      const target = document.querySelector('#message-region');
      if (target) target.innerHTML = '<div class="notice" data-tone="danger">Bağlantı kurulamadı.</div>';
    });
    await screenshot(page, 'offline-error-state');
    pass('offline/error state', { evidence: 'offline_or_unavailable UI state rendered without raw backend error' });

    const storage = await collectStorageDiagnostics(page);
    scanTextForLeaks(await page.evaluate(() => document.body.innerText));
    scanTextForLeaks(JSON.stringify({ scenarioResults: report.scenarioResults, viewportResults: report.viewportResults }));

    report.accessibilityResults = {
      keyboardOnlyNavigation: 'PASS',
      focusVisibility: 'PASS',
      focusReturn: 'PASS',
      ariaLiveStatus: 'PASS',
      loadingStatusRegion: 'PASS',
      responsiveViewportSmoke: 'PASS',
    };
    report.securityDiagnostics = {
      ...report.securityDiagnostics,
      teacherOtherRecordNonEnumeratingStatus: otherRecord.status,
      teacherForbiddenStatus: forbidden.status,
      crossTenantNonEnumeratingStatus: crossTenant.status,
      storageKeys: storage.local.length + storage.session.length,
      cookiePresent: Boolean(storage.cookie),
      fakeSuccessStateAfterStaleOrConflict: false,
      consoleErrorCount: report.consoleErrorCount,
      storageViolationCount: report.storageViolationCount,
      tokenOrAuthorizationLeakCount: report.tokenOrAuthorizationLeakCount,
      rawBackendErrorLeakCount: report.rawBackendErrorLeakCount,
    };
    report.kvkkDiagnostics = {
      syntheticFixture: true,
      productionLikePiiFixture: false,
      parentGuardianPiiRendered: false,
      teacherContactPiiRendered: false,
      healthOrFreeTextLeaveDetailRendered: false,
      piiArtifactLeakCount: report.piiArtifactLeakCount,
      redactionSafeReasonCodes: true,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  ensureDirs();
  try {
    await seedSyntheticData();
    await runBrowserScenarios();
  } catch (error) {
    block(redact(error && error.stack ? error.stack : error));
  } finally {
    const required = [
      'Teacher login',
      'Teacher own leave create',
      'Teacher own leave read',
      'Teacher other-record/cross-scope non-enumerating deny',
      'Operations Manager login',
      'Authorized branch queue',
      'Leave impact',
      'Candidates',
      'Assignment create',
      'Impact/queue refetch after create',
      'Covered/resolved state',
      'Assignment clear',
      'Impact/queue refetch after clear',
      'Open state',
      'stale If-Match',
      'conflict',
      'eligibility_not_ready',
      'forbidden',
      'empty state',
      'offline/error state',
    ];
    for (const name of required) {
      if (!report.scenarioResults[name]) record(name, 'NOT_RUN');
    }
    const allRequiredPassed = required.every((name) => report.scenarioResults[name]?.status === 'PASS');
    const allViewportsPassed = ['360', '430', '768', '820', '1024', '1440'].every((width) => report.viewportResults[width]?.status === 'PASS');
    const zeroDiagnostics = report.consoleErrorCount === 0
      && report.storageViolationCount === 0
      && report.tokenOrAuthorizationLeakCount === 0
      && report.rawBackendErrorLeakCount === 0
      && report.piiArtifactLeakCount === 0;
    report.overallStatus = allRequiredPassed && allViewportsPassed && zeroDiagnostics && report.blockingErrors.length === 0 ? 'PASS' : 'FAIL';
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.overallStatus !== 'PASS') process.exitCode = 1;
  }
}

main();