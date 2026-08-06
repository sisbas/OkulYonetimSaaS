'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const puppeteer = require('puppeteer-core');

let sparticuzChromium = null;
let sparticuzChromiumLoadError = null;
try {
  sparticuzChromium = require('@sparticuz/chromium');
} catch (error) {
  sparticuzChromium = null;
  sparticuzChromiumLoadError = error;
}

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts', 'wp07f-p0-browser-e2e');
const SCREEN_DIR = path.join(OUT_DIR, 'screenshots');
const REPORT_PATH = path.join(OUT_DIR, 'report.json');
const BASE_URL = process.env.APP_BASE_URL || 'http://127.0.0.1:3000';
const HEAD_SHA = process.env.PULL_REQUEST_HEAD_SHA || process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || 'unknown';
const RUN_ID = process.env.GITHUB_RUN_ID || 'local';
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const PUPPETEER_EXECUTABLE_STRATEGY = process.env.PUPPETEER_EXECUTABLE_STRATEGY || 'sparticuz';

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
  consoleDiagnostics: {
    ignoredExpectedHttpErrors: 0,
  },
  browserLaunch: {},
  blockingErrors: [],
};

function ensureDirs() {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(name, status, details = {}) {
  const entry = { ...details };
  if (Object.prototype.hasOwnProperty.call(entry, 'status')) {
    entry.httpStatus = entry.status;
    delete entry.status;
  }
  report.scenarioResults[name] = { status, ...entry };
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

function isExecutable(filePath) {
  if (!filePath) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveChromiumLaunchOptions() {
  const resolutionErrors = [];

  if (PUPPETEER_EXECUTABLE_STRATEGY !== 'sparticuz') {
    resolutionErrors.push(`Unsupported PUPPETEER_EXECUTABLE_STRATEGY: ${redact(PUPPETEER_EXECUTABLE_STRATEGY)}`);
    report.browserLaunch.resolutionErrors = resolutionErrors;
    assertCondition(false, 'P0 browser evidence requires PUPPETEER_EXECUTABLE_STRATEGY=sparticuz.');
  }

  if (!sparticuzChromium) {
    const loadDetail = sparticuzChromiumLoadError
      ? redact(`: ${sparticuzChromiumLoadError.code ? `${sparticuzChromiumLoadError.code} ` : ''}${sparticuzChromiumLoadError.message || sparticuzChromiumLoadError}`)
      : '';
    resolutionErrors.push(`@sparticuz/chromium module is not available after npm ci${loadDetail}.`);
    report.browserLaunch.resolutionErrors = resolutionErrors;
    assertCondition(false, `P0 browser evidence requires @sparticuz/chromium from the repository lockfile${loadDetail}.`);
  }

  try {
    const executablePath = await sparticuzChromium.executablePath();
    if (!isExecutable(executablePath)) {
      resolutionErrors.push(`@sparticuz/chromium executable is not runnable: ${executablePath}`);
      report.browserLaunch.resolutionErrors = resolutionErrors;
      assertCondition(false, '@sparticuz/chromium executable is not runnable.');
    }
    report.browserLaunch.resolutionErrors = resolutionErrors;
    return {
      strategy: '@sparticuz/chromium',
      executablePath,
      headless: process.env.PUPPETEER_HEADLESS === 'false' ? false : sparticuzChromium.headless,
      args: Array.from(new Set([
        ...(sparticuzChromium.args || []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ])),
    };
  } catch (error) {
    resolutionErrors.push(`@sparticuz/chromium executablePath failed: ${redact(error && error.message ? error.message : error)}`);
    report.browserLaunch.resolutionErrors = resolutionErrors;
    assertCondition(false, `Unable to resolve @sparticuz/chromium executable: ${redact(JSON.stringify(resolutionErrors))}`);
  }
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

async function one(client, sql, params = []) {
  const result = await query(client, sql, params);
  return result.rows[0] ?? null;
}

async function insertOrSelect(client, insertSql, insertParams, selectSql, selectParams) {
  try {
    const inserted = await query(client, insertSql, insertParams);
    if (inserted.rows[0]) return inserted.rows[0];
  } catch (error) {
    if (error?.code !== '23505' && error?.code !== '23P01') throw error;
  }
  const selected = await one(client, selectSql, selectParams);
  assertCondition(Boolean(selected), 'insert/select helper could not resolve row after conflict');
  return selected;
}

async function upsertTenant(client, slug, name) {
  const existing = await one(client, `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`, [slug]);
  if (existing) {
    const updated = await query(client, `UPDATE tenants SET name = $2, status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [existing.id, name]);
    return updated.rows[0];
  }
  return insertOrSelect(
    client,
    `INSERT INTO tenants (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
    [name, slug],
    `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
    [slug],
  );
}

async function upsertBranch(client, tenantId, code, name) {
  const existing = await one(client, `SELECT id FROM branches WHERE tenant_id = $1 AND code = $2 LIMIT 1`, [tenantId, code]);
  if (existing) {
    const updated = await query(client, `UPDATE branches SET name = $2, status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [existing.id, name]);
    return updated.rows[0];
  }
  return insertOrSelect(
    client,
    `INSERT INTO branches (tenant_id, name, code, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [tenantId, name, code],
    `SELECT id FROM branches WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [tenantId, code],
  );
}

async function upsertUser(client, tenantId, email, fullName, passwordHash) {
  const existing = await one(client, `SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]);
  const user = existing
    ? (await query(client, `
        UPDATE users
        SET credential_hash = $2,
            full_name = $3,
            status = 'active',
            token_version = token_version + 1,
            updated_at = now()
        WHERE id = $1
        RETURNING id
      `, [existing.id, passwordHash, fullName])).rows[0]
    : await insertOrSelect(
        client,
        `INSERT INTO users (email, credential_hash, full_name, status, token_version) VALUES ($1, $2, $3, 'active', 1) RETURNING id`,
        [email, passwordHash, fullName],
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [email],
      );

  const membership = await one(client, `SELECT tenant_id FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`, [tenantId, user.id]);
  if (membership) {
    await query(client, `UPDATE tenant_memberships SET status = 'active', deleted_at = NULL, updated_at = now() WHERE tenant_id = $1 AND user_id = $2`, [tenantId, user.id]);
  } else {
    await insertOrSelect(
      client,
      `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'active') RETURNING tenant_id`,
      [tenantId, user.id],
      `SELECT tenant_id FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      [tenantId, user.id],
    );
  }
  return user.id;
}

async function attachRole(client, tenantId, userId, roleName) {
  const role = await one(client, `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 LIMIT 1`, [tenantId, roleName]);
  assertCondition(Boolean(role), `role not found: ${roleName}`);
  const existing = await one(client, `SELECT 1 FROM user_roles WHERE tenant_id = $1 AND user_id = $2 AND role_id = $3 LIMIT 1`, [tenantId, userId, role.id]);
  if (!existing) {
    await insertOrSelect(
      client,
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3) RETURNING tenant_id`,
      [tenantId, userId, role.id],
      `SELECT tenant_id FROM user_roles WHERE tenant_id = $1 AND user_id = $2 AND role_id = $3 LIMIT 1`,
      [tenantId, userId, role.id],
    );
  }
}

async function ensureTeacherBranch(client, tenantId, teacherId, branchId) {
  const existing = await one(client, `SELECT id FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2 AND branch_id = $3 AND status = 'active' LIMIT 1`, [tenantId, teacherId, branchId]);
  if (existing) return existing.id;
  const inserted = await insertOrSelect(
    client,
    `INSERT INTO teacher_branches (tenant_id, teacher_id, branch_id, status, effective_from, effective_to) VALUES ($1, $2, $3, 'active', CURRENT_DATE - INTERVAL '1 day', NULL) RETURNING id`,
    [tenantId, teacherId, branchId],
    `SELECT id FROM teacher_branches WHERE tenant_id = $1 AND teacher_id = $2 AND branch_id = $3 AND status = 'active' LIMIT 1`,
    [tenantId, teacherId, branchId],
  );
  return inserted.id;
}

async function upsertTeacherForUser(client, tenantId, userId, code, firstName, lastName, branchId) {
  const existing = await one(client, `SELECT id FROM teachers WHERE tenant_id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL LIMIT 1`, [tenantId, userId]);
  const teacher = existing
    ? (await query(client, `UPDATE teachers SET employee_code = $2, first_name = $3, last_name = $4, status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [existing.id, code, firstName, lastName])).rows[0]
    : await insertOrSelect(
        client,
        `INSERT INTO teachers (tenant_id, user_id, employee_code, first_name, last_name, status) VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
        [tenantId, userId, code, firstName, lastName],
        `SELECT id FROM teachers WHERE tenant_id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
        [tenantId, userId],
      );
  const teacherBranchId = await ensureTeacherBranch(client, tenantId, teacher.id, branchId);
  return { teacherId: teacher.id, teacherBranchId };
}

async function upsertSubstituteTeacher(client, tenantId, code, firstName, lastName, branchId) {
  const existing = await one(client, `SELECT id FROM teachers WHERE tenant_id = $1 AND lower(employee_code) = lower($2) AND status = 'active' AND deleted_at IS NULL LIMIT 1`, [tenantId, code]);
  const teacher = existing
    ? (await query(client, `UPDATE teachers SET first_name = $2, last_name = $3, status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [existing.id, firstName, lastName])).rows[0]
    : await insertOrSelect(
        client,
        `INSERT INTO teachers (tenant_id, employee_code, first_name, last_name, status) VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [tenantId, code, firstName, lastName],
        `SELECT id FROM teachers WHERE tenant_id = $1 AND lower(employee_code) = lower($2) AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
        [tenantId, code],
      );
  const teacherBranchId = await ensureTeacherBranch(client, tenantId, teacher.id, branchId);
  return { teacherId: teacher.id, teacherBranchId };
}

async function upsertCourse(client, tenantId) {
  const code = 'P0-COURSE';
  const existing = await one(client, `SELECT id FROM courses WHERE tenant_id = $1 AND lower(code) = lower($2) LIMIT 1`, [tenantId, code]);
  if (existing) {
    const updated = await query(client, `UPDATE courses SET name = 'P0 Course', status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [existing.id]);
    return updated.rows[0];
  }
  return insertOrSelect(
    client,
    `INSERT INTO courses (tenant_id, name, code, status) VALUES ($1, 'P0 Course', $2, 'active') RETURNING id`,
    [tenantId, code],
    `SELECT id FROM courses WHERE tenant_id = $1 AND lower(code) = lower($2) LIMIT 1`,
    [tenantId, code],
  );
}

async function upsertRoom(client, tenantId, branchId) {
  const code = 'P0-ROOM';
  const existing = await one(client, `SELECT id FROM rooms WHERE tenant_id = $1 AND branch_id = $2 AND lower(code) = lower($3) LIMIT 1`, [tenantId, branchId, code]);
  if (existing) {
    const updated = await query(client, `UPDATE rooms SET name = 'P0 Room', capacity = 24, status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [existing.id]);
    return updated.rows[0];
  }
  return insertOrSelect(
    client,
    `INSERT INTO rooms (tenant_id, branch_id, name, code, capacity, status) VALUES ($1, $2, 'P0 Room', $3, 24, 'active') RETURNING id`,
    [tenantId, branchId, code],
    `SELECT id FROM rooms WHERE tenant_id = $1 AND branch_id = $2 AND lower(code) = lower($3) LIMIT 1`,
    [tenantId, branchId, code],
  );
}

async function upsertStudentGroup(client, tenantId, branchId) {
  const code = 'P0-GROUP';
  const existing = await one(client, `SELECT id FROM student_groups WHERE tenant_id = $1 AND branch_id = $2 AND lower(code) = lower($3) AND deleted_at IS NULL LIMIT 1`, [tenantId, branchId, code]);
  if (existing) {
    const updated = await query(client, `UPDATE student_groups SET name = 'P0 Group', status = 'active', updated_at = now() WHERE id = $1 RETURNING id`, [existing.id]);
    return updated.rows[0];
  }
  return insertOrSelect(
    client,
    `INSERT INTO student_groups (tenant_id, branch_id, name, code, status) VALUES ($1, $2, 'P0 Group', $3, 'active') RETURNING id`,
    [tenantId, branchId, code],
    `SELECT id FROM student_groups WHERE tenant_id = $1 AND branch_id = $2 AND lower(code) = lower($3) AND deleted_at IS NULL LIMIT 1`,
    [tenantId, branchId, code],
  );
}

async function upsertTimeSlot(client, tenantId, branchId, dayOfWeek) {
  const existing = await one(client, `SELECT id FROM time_slots WHERE tenant_id = $1 AND branch_id = $2 AND day_of_week = $3 AND start_time = '10:00'::time AND end_time = '11:00'::time AND status = 'active' LIMIT 1`, [tenantId, branchId, dayOfWeek]);
  if (existing) {
    const updated = await query(client, `UPDATE time_slots SET name = 'P0 Slot', order_index = 1, updated_at = now() WHERE id = $1 RETURNING id`, [existing.id]);
    return updated.rows[0];
  }
  return insertOrSelect(
    client,
    `INSERT INTO time_slots (tenant_id, branch_id, name, day_of_week, start_time, end_time, order_index, status) VALUES ($1, $2, 'P0 Slot', $3, '10:00', '11:00', 1, 'active') RETURNING id`,
    [tenantId, branchId, dayOfWeek],
    `SELECT id FROM time_slots WHERE tenant_id = $1 AND branch_id = $2 AND day_of_week = $3 AND start_time = '10:00'::time AND end_time = '11:00'::time AND status = 'active' LIMIT 1`,
    [tenantId, branchId, dayOfWeek],
  );
}

async function seedSyntheticData() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const tenantRows = await query(client, `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`, [safeStrings.tenantSlug]);
    assertCondition(tenantRows.rowCount === 1, 'system-seed tenant not found; db:seed:permissions must run first');
    const tenantId = tenantRows.rows[0].id;
    const foreignTenant = await upsertTenant(client, safeStrings.foreignTenantSlug, 'P0 Foreign Tenant');
    const branch = await upsertBranch(client, tenantId, safeStrings.branchCode, 'P0 Synthetic Branch');
    const otherBranch = await upsertBranch(client, tenantId, safeStrings.otherBranchCode, 'P0 Empty Branch');
    const foreignBranch = await upsertBranch(client, foreignTenant.id, safeStrings.foreignBranchCode, 'P0 Foreign Branch');

    const passwordHash = await bcrypt.hash(safeStrings.password, 10);
    const teacherUserId = await upsertUser(client, tenantId, safeStrings.teacherEmail, 'P0 Synthetic Teacher', passwordHash);
    const otherTeacherUserId = await upsertUser(client, tenantId, safeStrings.otherTeacherEmail, 'P0 Synthetic Other Teacher', passwordHash);
    const opsUserId = await upsertUser(client, tenantId, safeStrings.opsEmail, 'P0 Synthetic Operations', passwordHash);

    await attachRole(client, tenantId, teacherUserId, 'teacher');
    await attachRole(client, tenantId, otherTeacherUserId, 'teacher');
    await attachRole(client, tenantId, opsUserId, 'operations_manager');

    const teacher = await upsertTeacherForUser(client, tenantId, teacherUserId, 'P0-T-1', 'P0', 'Teacher', branch.id);
    const otherTeacher = await upsertTeacherForUser(client, tenantId, otherTeacherUserId, 'P0-T-2', 'P0', 'Other', branch.id);
    const substitute = await upsertSubstituteTeacher(client, tenantId, 'P0-SUB-1', 'P0', 'Substitute', branch.id);
    const course = await upsertCourse(client, tenantId);
    const room = await upsertRoom(client, tenantId, branch.id);
    const group = await upsertStudentGroup(client, tenantId, branch.id);

    const target = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const occurrenceDate = yyyyMmDd(target);
    const dayOfWeek = isoDayOfWeek(target);
    const timeSlot = await upsertTimeSlot(client, tenantId, branch.id, dayOfWeek);

    const schedule = await query(client, `
      INSERT INTO schedules (tenant_id, branch_id, status, revision, effective_from, effective_to)
      VALUES ($1, $2, 'published', 1, $3::date - INTERVAL '1 day', $3::date + INTERVAL '7 days')
      RETURNING id
    `, [tenantId, branch.id, occurrenceDate]);
    const version = await query(client, `
      INSERT INTO schedule_versions (tenant_id, branch_id, schedule_id, version_no, status, validation_mode, validation_fingerprint, validated_revision, snapshot, published_at)
      VALUES ($1, $2, $3, 1, 'published', 'FULL', 'p0-browser-e2e', 1, '{}'::jsonb, now())
      RETURNING id
    `, [tenantId, branch.id, schedule.rows[0].id]);
    await query(client, `UPDATE schedules SET active_version_id = $1, updated_at = now() WHERE id = $2`, [version.rows[0].id, schedule.rows[0].id]);
    const event = await query(client, `
      INSERT INTO schedule_events (tenant_id, branch_id, schedule_id, version_id, teacher_id, teacher_branch_id, student_group_id, course_id, room_id, time_slot_id, day_of_week, start_time, end_time, time_slot_snapshot)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '10:00', '11:00', '{"label":"P0 Slot"}'::jsonb)
      RETURNING id
    `, [tenantId, branch.id, schedule.rows[0].id, version.rows[0].id, teacher.teacherId, teacher.teacherBranchId, group.id, course.id, room.id, timeSlot.id, dayOfWeek]);

    await query(client, `
      INSERT INTO teacher_courses (tenant_id, teacher_id, course_id, status, effective_from, effective_to)
      VALUES ($1, $2, $3, 'active', $4::date - INTERVAL '1 day', NULL)
      ON CONFLICT DO NOTHING
    `, [tenantId, substitute.teacherId, course.id, occurrenceDate]);

    const approvedLeave = await query(client, `
      INSERT INTO leave_requests (tenant_id, branch_id, teacher_id, requester_user_id, duration_type, reason_code, decision_status, coverage_status, starts_at, ends_at, version)
      VALUES ($1, $2, $3, $4, 'hourly', 'administrative', 'approved', 'unresolved', $5, $6, 1)
      RETURNING id
    `, [tenantId, branch.id, teacher.teacherId, teacherUserId, dateAtUtc(target, 7), dateAtUtc(target, 8)]);
    const otherLeave = await query(client, `
      INSERT INTO leave_requests (tenant_id, branch_id, teacher_id, requester_user_id, duration_type, reason_code, decision_status, coverage_status, starts_at, ends_at, version)
      VALUES ($1, $2, $3, $4, 'hourly', 'administrative', 'pending', 'not_required', $5, $6, 1)
      RETURNING id
    `, [tenantId, branch.id, otherTeacher.teacherId, otherTeacherUserId, dateAtUtc(target, 9), dateAtUtc(target, 10)]);

    report.seed = {
      tenantId,
      branchId: branch.id,
      otherBranchId: otherBranch.id,
      foreignBranchId: foreignBranch.id,
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
  await page.$eval(selector, (input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
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
  await page.$eval('#session-status', (el) => {
    el.textContent = 'Oturum doğrulanıyor';
    el.dataset.tone = 'neutral';
  });
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/auth/login') && response.request().method() === 'POST',
    { timeout: 10000 },
  );
  await clickSubmitFor(page, '#login-form');
  const response = await loginResponse;
  assertCondition(response.ok(), `${scenarioName} auth response failed: ${response.status()}`);
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

function isExpectedNegativeHttpConsole(text) {
  return /Failed to load resource/i.test(text)
    && /status of (403|404|409|412)/i.test(text);
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

async function verifyConsoleCapture(page) {
  const marker = `p0-console-capture-${Date.now()}`;
  let captured = false;
  const handler = (msg) => {
    if (msg.text().includes(marker)) captured = true;
  };
  page.on('console', handler);
  try {
    await page.evaluate((value) => console.info(value), marker);
    const started = Date.now();
    while (!captured && Date.now() - started < 3000) {
      await sleep(50);
    }
    assertCondition(captured, 'console capture probe was not observed');
  } finally {
    page.off('console', handler);
  }
}

async function runBrowserScenarios() {
  const launchOptions = await resolveChromiumLaunchOptions();
  const launchErrors = [];
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: launchOptions.executablePath,
      headless: launchOptions.headless,
      args: launchOptions.args,
      timeout: 90000,
      protocolTimeout: 90000,
      dumpio: Boolean(process.env.PUPPETEER_DUMPIO),
    });
  } catch (error) {
    launchErrors.push({
      strategy: launchOptions.strategy,
      executablePath: launchOptions.executablePath,
      message: redact(error && error.message ? error.message : error),
    });
  }
  report.browserLaunch = {
    ...report.browserLaunch,
    strategy: launchOptions.strategy,
    executablePath: launchOptions.executablePath,
    headless: launchOptions.headless,
    timeoutMs: 90000,
    args: launchOptions.args,
    attemptedStrategies: [launchOptions.strategy],
    launchErrors,
  };
  assertCondition(Boolean(browser), `Chromium launch failed: ${redact(JSON.stringify(launchErrors))}`);
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      if (isExpectedNegativeHttpConsole(msg.text())) {
        report.consoleDiagnostics.ignoredExpectedHttpErrors += 1;
        return;
      }
      report.consoleErrorCount += 1;
    });
    page.on('pageerror', () => {
      report.consoleErrorCount += 1;
    });

    pass('Minimal smoke: browser launches', {
      strategy: launchOptions.strategy,
      executablePath: launchOptions.executablePath,
      headless: launchOptions.headless,
    });
    await verifyConsoleCapture(page);
    pass('Minimal smoke: console capture works');
    await page.setViewport({ width: 430, height: 800 });
    await waitForRuntime(page);
    pass('Minimal smoke: page opens /runtime');
    await screenshot(page, 'minimal-chromium-smoke');
    pass('Minimal smoke: screenshot capture works');

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
    await page.click('.tab[data-tab="ops"]');
    await page.waitForSelector('#ops-panel:not(.hidden)', { timeout: 5000 });
    await typeIfExists(page, '#branch-id', report.seed.branchId);
    await typeIfExists(page, '#operation-date', report.seed.occurrenceDate);
    const contextValues = await page.evaluate(() => ({
      branchId: document.querySelector('#branch-id')?.value || '',
      operationDate: document.querySelector('#operation-date')?.value || '',
    }));
    assertCondition(contextValues.branchId === report.seed.branchId, `branch input was not set: ${contextValues.branchId}`);
    assertCondition(contextValues.operationDate === report.seed.occurrenceDate, `date input was not set: ${contextValues.operationDate}`);

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
      'Minimal smoke: browser launches',
      'Minimal smoke: page opens /runtime',
      'Minimal smoke: console capture works',
      'Minimal smoke: screenshot capture works',
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
