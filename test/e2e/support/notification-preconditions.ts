import { columnText, PgClient, PgRow } from './pg-client';

/**
 * N3 kabul önkoşulları — Node tarafı bootstrap.
 *
 * Sözleşme:
 * - Önkoşul kurulumu (program → yoklama → kilit → outbox satırları) PUBLIC API
 *   üzerinden yapılır; `page.evaluate` içinde fetch YOKTUR (guard kuralı 3,
 *   Node-side fetch evaluate dışında olduğu için serbesttir).
 * - Bildirim durum geçişlerinin TAMAMI görünür UI'dan yapılır; bu modül yalnız
 *   önkoşul üretir ve salt-okunur kanıt sorguları sağlar.
 * - `notification_outbox` / `notification_dispatch_receipts` asla yazılmaz;
 *   iş sonucu tablolarına yalnız dispatch servisi yazar (guard kuralı 1/2).
 */

export class BootstrapHttpError extends Error {
  readonly status: number;
  readonly bodyText: string;

  constructor(method: string, path: string, status: number, bodyText: string) {
    super(`Bootstrap ${method} ${path} failed with HTTP ${status}: ${bodyText.slice(0, 400)}`);
    this.name = 'BootstrapHttpError';
    this.status = status;
    this.bodyText = bodyText;
  }
}

export type BootstrapApi = Readonly<{
  baseUrl: string;
  token: string;
  branchCode: string | null;
}>;

function shouldSkipBranchHeader(path: string): boolean {
  return path.startsWith('/context') || path.startsWith('/auth/');
}

/**
 * Bootstrap HTTP istemcisi. UI `apiRequest` ile aynı başlık sözleşmesi:
 * `Authorization: Bearer` + `/context` ve `/auth/` dışına `x-branch-code`.
 */
export async function apiCall(
  api: BootstrapApi,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  headers.Authorization = `Bearer ${api.token}`;
  if (api.branchCode !== null && !shouldSkipBranchHeader(path)) {
    headers['x-branch-code'] = api.branchCode;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${api.baseUrl}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    // Ağır yüklü CI çalıştırıcılarında ara ara görülen HTTP katmanı duraksamasını
    // yanlış negatif üretmeden tolere et; kalıcı bağlantı geri dönüşümünü kapat.
    keepalive: false,
    signal: AbortSignal.timeout(40_000),
  });
  const text = await response.text();
  if (!response.ok) throw new BootstrapHttpError(method, path, response.status, text);
  return { status: response.status, json: text.length > 0 ? (JSON.parse(text) as unknown) : null };
}

/** POST /auth/login → access token (yalnız önkoşul kurulumu için). */
export async function loginForBootstrap(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await response.text();
  if (!response.ok) throw new BootstrapHttpError('POST', '/auth/login', response.status, text);
  const body = JSON.parse(text) as { accessToken?: unknown };
  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) {
    throw new Error('Bootstrap login response did not include an accessToken.');
  }
  return body.accessToken;
}

/** POST /context/branch — şube seçimi kalıcıdır (user_sessions). */
export async function selectBranchForBootstrap(
  api: BootstrapApi,
  selection: Readonly<{ branchName: string; branchCode: string }>,
): Promise<{ activeBranchCode: string | null }> {
  const { json } = await apiCall(api, 'POST', '/context/branch', {
    branchName: selection.branchName,
    branchCode: selection.branchCode,
  });
  const catalog = json as { activeBranch?: { code?: string } | null };
  return { activeBranchCode: catalog.activeBranch?.code ?? null };
}

export type BootstrapScheduleEventInput = Readonly<{
  teacherId: string;
  teacherBranchId: string;
  studentGroupId: string;
  courseId: string;
  roomId: string;
  timeSlotId: string;
  /** time_slots.day_of_week ile aynı gün (fixture: 1, 10:00-11:00). */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}>;

export function buildBootstrapScheduleEvent(
  input: BootstrapScheduleEventInput,
): Record<string, unknown> {
  return {
    eventId: 'n3-e1',
    teacherId: input.teacherId,
    teacherBranchId: input.teacherBranchId,
    studentGroupId: input.studentGroupId,
    courseId: input.courseId,
    roomId: input.roomId,
    timeSlotId: input.timeSlotId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
  };
}

export type BootstrapScheduleResult = Readonly<{
  scheduleId: string;
  scheduleEventId: string;
  reusedPublishedEvent: boolean;
}>;

/**
 * Program önkoşulu: create (rev 1) → draft (rev 2) → publish (rev 2) →
 * yayınlanan schedule_events satırının id'si (salt-okunur SELECT).
 *
 * Aynı branch'te yayınlanan bir olay zaten varsa yeniden kullanılır
 * (idempotent tekrar çalıştırma).
 */
export async function bootstrapPublishedSchedule(
  api: BootstrapApi,
  client: PgClient,
  input: Readonly<{
    tenantId: string;
    branchId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    event: BootstrapScheduleEventInput;
  }>,
): Promise<BootstrapScheduleResult> {
  const existing = await client.query(
    `
      SELECT se.id::text AS id
        FROM schedule_events se
        JOIN schedule_versions sv ON sv.id = se.version_id AND sv.tenant_id = se.tenant_id
       WHERE se.tenant_id = $1::uuid AND se.branch_id = $2::uuid AND sv.status = 'published'
       ORDER BY se.created_at DESC
       LIMIT 1
    `,
    [input.tenantId, input.branchId],
  );
  const existingRow = existing.rows[0];
  if (existingRow !== undefined) {
    return Object.freeze({
      scheduleId: '',
      scheduleEventId: columnText(existingRow, 'id', 'schedule_events.id'),
      reusedPublishedEvent: true,
    });
  }

  const created = await apiCall(api, 'POST', '/schedules', {
    branchId: input.branchId,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
  });
  const schedule = created.json as { id?: unknown };
  if (typeof schedule.id !== 'string') {
    throw new Error('Schedule create response did not include an id.');
  }
  const scheduleId = schedule.id;
  const draftEvent = buildBootstrapScheduleEvent(input.event);

  await apiCall(api, 'POST', `/schedules/${scheduleId}/draft`, {
    branchId: input.branchId,
    events: [draftEvent],
  });
  await apiCall(api, 'POST', `/schedules/${scheduleId}/publish`, {
    branchId: input.branchId,
    events: [draftEvent],
    revision: 2,
    requestId: `n3-publish-${Date.now()}`,
  });

  const published = await client.query(
    `
      SELECT se.id::text AS id
        FROM schedule_events se
        JOIN schedule_versions sv ON sv.id = se.version_id AND sv.tenant_id = se.tenant_id
       WHERE se.tenant_id = $1::uuid AND se.schedule_id = $2::uuid AND sv.status = 'published'
       ORDER BY se.created_at DESC
       LIMIT 1
    `,
    [input.tenantId, scheduleId],
  );
  const publishedRow = published.rows[0];
  if (publishedRow === undefined) {
    throw new Error(`No published schedule_events row found for schedule ${scheduleId} after publish.`);
  }
  return Object.freeze({
    scheduleId,
    scheduleEventId: columnText(publishedRow, 'id', 'schedule_events.id'),
    reusedPublishedEvent: false,
  });
}

export type AttendanceSessionResult = Readonly<{
  sessionId: string;
  status: string;
  version: number;
}>;

/**
 * Yoklama önkoşulu: create (published, version 1) → her öğrenci için absent
 * kaydı → lock (expectedVersion 1). Kilit transaction'ı içinde absent
 * öğrenciler için outbox satırları enqueue edilir (#266).
 */
export async function bootstrapAttendanceSession(
  api: BootstrapApi,
  input: Readonly<{
    tenantId: string;
    scheduleEventId: string;
    sessionDate: string;
    studentIds: ReadonlyArray<string>;
  }>,
): Promise<AttendanceSessionResult> {
  const created = await apiCall(api, 'POST', '/attendance/sessions', {
    tenantId: input.tenantId,
    scheduleEventId: input.scheduleEventId,
    sessionDate: input.sessionDate,
    studentIds: [...input.studentIds],
  });
  const session = created.json as { id?: unknown; status?: unknown; version?: unknown };
  if (typeof session.id !== 'string') {
    throw new Error('Attendance session create response did not include an id.');
  }
  const sessionId = session.id;
  let status = String(session.status ?? '');
  let version = Number(session.version ?? 1);

  if (status === 'locked') {
    return Object.freeze({ sessionId, status, version });
  }

  for (const studentId of input.studentIds) {
    await apiCall(api, 'POST', `/attendance/sessions/${sessionId}/records`, {
      studentId,
      status: 'absent',
    });
  }

  const locked = await apiCall(api, 'POST', `/attendance/sessions/${sessionId}/lock`, {
    expectedVersion: version,
  });
  const lockedSession = locked.json as { status?: unknown; version?: unknown };
  return Object.freeze({
    sessionId,
    status: String(lockedSession.status ?? ''),
    version: Number(lockedSession.version ?? 0),
  });
}

/** Oturumdaki outbox satırlarını studentId → outboxId eşlemesi olarak okur. */
export async function readOutboxIdsBySession(
  client: PgClient,
  tenantId: string,
  sessionId: string,
): Promise<Readonly<Record<string, string>>> {
  const result = await client.query(
    `
      SELECT student_id::text AS student_id, id::text AS id
        FROM notification_outbox
       WHERE tenant_id = $1::uuid AND session_id = $2::uuid
       ORDER BY created_at ASC
    `,
    [tenantId, sessionId],
  );
  const map: Record<string, string> = {};
  for (const row of result.rows as PgRow[]) {
    map[columnText(row, 'student_id', 'notification_outbox.student_id')] = columnText(
      row,
      'id',
      'notification_outbox.id',
    );
  }
  return Object.freeze(map);
}

export type DispatchReceiptSnapshot = Readonly<{
  attempt: number;
  outcome: string;
  simulated: boolean;
  providerRef: string | null;
}>;

export type DispatchRowSnapshot = Readonly<{
  outboxId: string;
  status: string;
  version: number;
  attempts: number;
  consentVersion: number | null;
  reason: string | null;
  availableAt: string;
  dispatchedAt: string | null;
  receipts: ReadonlyArray<DispatchReceiptSnapshot>;
}>;

/** Salt-okunur kanıt okuması: outbox satırı + kalıcı receipt'ler. */
export async function readDispatchRow(
  client: PgClient,
  tenantId: string,
  outboxId: string,
): Promise<DispatchRowSnapshot> {
  const rowResult = await client.query(
    `
      SELECT id::text AS id, status, version, attempts, consent_version, reason,
             available_at, dispatched_at
        FROM notification_outbox
       WHERE tenant_id = $1::uuid AND id = $2::uuid
    `,
    [tenantId, outboxId],
  );
  const row = rowResult.rows[0];
  if (row === undefined) {
    throw new Error(`notification_outbox row ${outboxId} not found for tenant ${tenantId}.`);
  }

  const receiptsResult = await client.query(
    `
      SELECT attempt, outcome, simulated, provider_ref
        FROM notification_dispatch_receipts
       WHERE tenant_id = $1::uuid AND outbox_id = $2::uuid
       ORDER BY attempt ASC
    `,
    [tenantId, outboxId],
  );
  const receipts: DispatchReceiptSnapshot[] = (
    receiptsResult.rows as PgRow[]
  ).map((receipt) =>
    Object.freeze({
      attempt: Number(receipt.attempt),
      outcome: columnText(receipt, 'outcome', 'receipt.outcome'),
      simulated: Boolean(receipt.simulated),
      providerRef:
        receipt.provider_ref === null || receipt.provider_ref === undefined
          ? null
          : String(receipt.provider_ref),
    }),
  );

  return Object.freeze({
    outboxId: columnText(row, 'id', 'notification_outbox.id'),
    status: columnText(row, 'status', 'notification_outbox.status'),
    version: Number(row.version ?? 0),
    attempts: Number(row.attempts ?? 0),
    consentVersion:
      row.consent_version === null || row.consent_version === undefined
        ? null
        : Number(row.consent_version),
    reason:
      row.reason === null || row.reason === undefined ? null : String(row.reason),
    availableAt: new Date(String(row.available_at)).toISOString(),
    dispatchedAt:
      row.dispatched_at === null || row.dispatched_at === undefined
        ? null
        : new Date(String(row.dispatched_at)).toISOString(),
    receipts: Object.freeze(receipts),
  });
}

const AVAILABLE_POLL_INTERVAL_MS = 500;

/**
 * Backoff kanıtı: `available_at` sunucu saatine göre hazır olana kadar
 * salt-okunur poll (BACKOFF_ACTIVE çakışmasını UI'dan önce beklemek için).
 *
 * Claim tarafı aynı DB sütununa `available_at <= now()` ile bakar; poll'un
 * dönüşü ile client'ın POST'unun sunucuya varışı arasındaki jalp/clock yarışını
 * emniyete almak için READY eşiği ek marjla ötelenir. Kanıt zayıflamaz: backoff
 * aralığı (5s/10s) aynen test edilir; yalnızca "hazırdır" kararı marj sonrasına
 * alınır.
 */
const AVAILABLE_MARGIN_MS = 1500;

export async function waitForDispatchAvailable(
  client: PgClient,
  tenantId: string,
  outboxId: string,
  timeoutMs = 60_000,
): Promise<DispatchRowSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let last: DispatchRowSnapshot | null = null;
  while (Date.now() < deadline) {
    last = await readDispatchRow(client, tenantId, outboxId);
    if (new Date(last.availableAt).getTime() <= Date.now() - AVAILABLE_MARGIN_MS) return last;
    await new Promise<void>((resolve) => setTimeout(resolve, AVAILABLE_POLL_INTERVAL_MS));
  }
  throw new Error(
    `notification_outbox ${outboxId} did not become available within ${timeoutMs}ms ` +
      `(last availableAt=${last?.availableAt ?? 'n/a'}).`,
  );
}
