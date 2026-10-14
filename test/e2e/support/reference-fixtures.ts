import * as bcrypt from 'bcryptjs';
import { isReferenceTable } from './acceptance-tables';
import { columnText, isUniqueViolation, PgClient, PgRow, redactDatabaseError } from './pg-client';

/**
 * S0-A1 (#269 AC-1) — REFERANS-FIXTURE-ONLY seeder.
 *
 * Bu dosya yalnız master/referans verisi üretir: kurum (mevcut seed kurumu),
 * şube, kullanıcı, üyelik/rol bağlantısı, öğretmen, ders, oda, öğrenci grubu,
 * zaman dilimi ve öğretmen-şube ilişkisi.
 *
 * İş sonucu ÜRETMEZ. Onaylı izin, yedek görevlendirme, yoklama, bildirim veya
 * program olayı yalnız gerçek kullanıcı yolundan (görünür UI / public API)
 * doğar. `assertReferenceWrite` bu sözleşmeyi kod düzeyinde zorlar: listeye
 * girmeyen bir tabloya yazma denemesi testi durdurur.
 */

export class FixtureContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixtureContractError';
  }
}

export type FixtureUser = Readonly<{
  userId: string;
  email: string;
  roleCode: string;
  /** Sentetik oturum parolası; hiçbir yere loglanmaz/artefakta yazılmaz. */
  credential: string;
}>;

export type ReferenceFixture = Readonly<{
  tenantId: string;
  branchId: string;
  branchCode: string;
  opsUser: FixtureUser;
  teacherUser: FixtureUser;
  teacherId: string;
  teacherBranchId: string;
  courseId: string;
  roomId: string;
  studentGroupId: string;
  timeSlotId: string;
}>;

export type SeedReferenceFixtureInput = Readonly<{
  tenantSlug: string;
  credential: string;
  /** Deterministik fixture adları; testler bu adları doğrular. */
  namespace: string;
}>;

function assertReferenceWrite(table: string): void {
  if (!isReferenceTable(table)) {
    throw new FixtureContractError(
      `E2E seeder may only write reference tables. Refused write to '${table}'. ` +
        'Business outcomes must be produced through the real user journey, not SQL.',
    );
  }
}

/**
 * Select-first + insert-if-missing. Tabloda doğal anahtar için unique kısıt
 * olmasa bile idempotent kalır (tekrar çalıştırma satır çoğaltmaz).
 */
async function ensureRow(
  client: PgClient,
  input: Readonly<{
    table: string;
    label: string;
    selectSql: string;
    selectParams: ReadonlyArray<unknown>;
    insertSql: string;
    insertParams: ReadonlyArray<unknown>;
  }>,
): Promise<PgRow> {
  assertReferenceWrite(input.table);

  const existing = await client.query(input.selectSql, input.selectParams);
  const found = existing.rows[0];
  if (found !== undefined) return found;

  try {
    const inserted = await client.query(input.insertSql, input.insertParams);
    const row = inserted.rows[0];
    if (row === undefined) {
      throw new FixtureContractError(
        `Insert into ${input.table} did not return a row (${input.label}).`,
      );
    }
    return row;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const retry = await client.query(input.selectSql, input.selectParams);
    const row = retry.rows[0];
    if (row === undefined) {
      throw new FixtureContractError(
        `Conflicting ${input.table} row could not be resolved (${input.label}).`,
      );
    }
    return row;
  }
}

async function requireRoleId(
  client: PgClient,
  tenantId: string,
  roleCode: string,
): Promise<string> {
  const result = await client.query(
    `SELECT id::text AS id FROM roles WHERE tenant_id = $1::uuid AND name = $2 AND deleted_at IS NULL`,
    [tenantId, roleCode],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new FixtureContractError(
      `Role '${roleCode}' is missing in the seeded tenant. Run "npm run db:seed:permissions" before the acceptance harness.`,
    );
  }
  return columnText(row, 'id', `roles.name=${roleCode}`);
}

async function requireSeedTenantId(client: PgClient, tenantSlug: string): Promise<string> {
  const result = await client.query(`SELECT id::text AS id FROM tenants WHERE slug = $1`, [
    tenantSlug,
  ]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new FixtureContractError(
      `Tenant '${tenantSlug}' is missing. Run "npm run db:seed:permissions" before the acceptance harness.`,
    );
  }
  return columnText(row, 'id', `tenants.slug=${tenantSlug}`);
}

async function ensureUser(
  client: PgClient,
  input: Readonly<{
    tenantId: string;
    email: string;
    fullName: string;
    employeeCode: string;
    credential: string;
    roleCode: string;
    roleId: string;
  }>,
): Promise<FixtureUser> {
  const credentialHash = bcrypt.hashSync(input.credential, 10);

  const user = await ensureRow(client, {
    table: 'users',
    label: `users.email=${input.email}`,
    selectSql: `SELECT id::text AS id FROM users WHERE email = $1`,
    selectParams: [input.email],
    insertSql: `
      INSERT INTO users (email, credential_hash, full_name, status, token_version)
      VALUES ($1, $2, $3, 'active', 1)
      RETURNING id::text AS id
    `,
    insertParams: [input.email, credentialHash, input.fullName],
  });
  const userId = columnText(user, 'id', `users.email=${input.email}`);

  await ensureRow(client, {
    table: 'tenant_memberships',
    label: `tenant_memberships(${input.email})`,
    selectSql: `
      SELECT tenant_id::text AS id FROM tenant_memberships
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND status = 'active'
    `,
    selectParams: [input.tenantId, userId],
    insertSql: `
      INSERT INTO tenant_memberships (tenant_id, user_id, status)
      VALUES ($1::uuid, $2::uuid, 'active')
      RETURNING tenant_id::text AS id
    `,
    insertParams: [input.tenantId, userId],
  });

  await ensureRow(client, {
    table: 'user_roles',
    label: `user_roles(${input.email} -> ${input.roleCode})`,
    selectSql: `
      SELECT tenant_id::text AS id FROM user_roles
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = $3::uuid
    `,
    selectParams: [input.tenantId, userId, input.roleId],
    insertSql: `
      INSERT INTO user_roles (tenant_id, user_id, role_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid)
      RETURNING tenant_id::text AS id
    `,
    insertParams: [input.tenantId, userId, input.roleId],
  });

  return Object.freeze({
    userId,
    email: input.email,
    roleCode: input.roleCode,
    credential: input.credential,
  });
}

/**
 * Referans fixture'ları idempotent biçimde kurar ve testlerin ihtiyaç duyduğu
 * kimlikleri döner. Hiçbir iş sonucu tablosuna yazmaz.
 */
export async function seedReferenceFixtures(
  client: PgClient,
  input: SeedReferenceFixtureInput,
): Promise<ReferenceFixture> {
  const tenantId = await requireSeedTenantId(client, input.tenantSlug);

  const opsRoleId = await requireRoleId(client, tenantId, 'operations_manager');
  const teacherRoleId = await requireRoleId(client, tenantId, 'teacher');

  const ns = input.namespace;
  const branchCode = `${ns.toUpperCase()}-BRANCH`;

  const branch = await ensureRow(client, {
    table: 'branches',
    label: `branches.code=${branchCode}`,
    selectSql: `SELECT id::text AS id FROM branches WHERE tenant_id = $1::uuid AND code = $2`,
    selectParams: [tenantId, branchCode],
    insertSql: `
      INSERT INTO branches (tenant_id, name, code, status)
      VALUES ($1::uuid, $2, $3, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, `${ns} reference branch`, branchCode],
  });
  const branchId = columnText(branch, 'id', `branches.code=${branchCode}`);

  const opsUser = await ensureUser(client, {
    tenantId,
    email: `ops.${ns}@qa.invalid`,
    fullName: `${ns} operations manager`,
    employeeCode: `${ns}-ops`,
    credential: input.credential,
    roleCode: 'operations_manager',
    roleId: opsRoleId,
  });

  const teacherUser = await ensureUser(client, {
    tenantId,
    email: `teacher.${ns}@qa.invalid`,
    fullName: `${ns} teacher`,
    employeeCode: `${ns}-teacher`,
    credential: input.credential,
    roleCode: 'teacher',
    roleId: teacherRoleId,
  });

  const teacher = await ensureRow(client, {
    table: 'teachers',
    label: `teachers.employee_code=${ns}-teacher`,
    selectSql: `SELECT id::text AS id FROM teachers WHERE tenant_id = $1::uuid AND employee_code = $2`,
    selectParams: [tenantId, `${ns}-teacher`],
    insertSql: `
      INSERT INTO teachers (tenant_id, user_id, employee_code, first_name, last_name, status)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, teacherUser.userId, `${ns}-teacher`, ns, 'teacher'],
  });
  const teacherId = columnText(teacher, 'id', `teachers.employee_code=${ns}-teacher`);

  const teacherBranch = await ensureRow(client, {
    table: 'teacher_branches',
    label: `teacher_branches(${ns})`,
    selectSql: `
      SELECT id::text AS id FROM teacher_branches
      WHERE tenant_id = $1::uuid AND teacher_id = $2::uuid AND branch_id = $3::uuid AND status = 'active'
    `,
    selectParams: [tenantId, teacherId, branchId],
    insertSql: `
      INSERT INTO teacher_branches (tenant_id, teacher_id, branch_id, status, effective_from, effective_to)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, teacherId, branchId],
  });
  const teacherBranchId = columnText(
    teacherBranch,
    'id',
    `teacher_branches(${ns})`,
  );

  const course = await ensureRow(client, {
    table: 'courses',
    label: `courses.code=${ns}-course`,
    selectSql: `SELECT id::text AS id FROM courses WHERE tenant_id = $1::uuid AND code = $2`,
    selectParams: [tenantId, `${ns}-course`],
    insertSql: `
      INSERT INTO courses (tenant_id, name, code, status)
      VALUES ($1::uuid, $2, $3, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, `${ns} reference course`, `${ns}-course`],
  });

  const room = await ensureRow(client, {
    table: 'rooms',
    label: `rooms.code=${ns}-room`,
    selectSql: `SELECT id::text AS id FROM rooms WHERE tenant_id = $1::uuid AND branch_id = $2::uuid AND code = $3`,
    selectParams: [tenantId, branchId, `${ns}-room`],
    insertSql: `
      INSERT INTO rooms (tenant_id, branch_id, name, code, capacity, status)
      VALUES ($1::uuid, $2::uuid, $3, $4, 24, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, branchId, `${ns} reference room`, `${ns}-room`],
  });

  const studentGroup = await ensureRow(client, {
    table: 'student_groups',
    label: `student_groups.code=${ns}-group`,
    selectSql: `SELECT id::text AS id FROM student_groups WHERE tenant_id = $1::uuid AND branch_id = $2::uuid AND code = $3`,
    selectParams: [tenantId, branchId, `${ns}-group`],
    insertSql: `
      INSERT INTO student_groups (tenant_id, branch_id, name, code, status)
      VALUES ($1::uuid, $2::uuid, $3, $4, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, branchId, `${ns} reference group`, `${ns}-group`],
  });

  const timeSlot = await ensureRow(client, {
    table: 'time_slots',
    label: `time_slots.name=${ns}-slot`,
    selectSql: `
      SELECT id::text AS id FROM time_slots
      WHERE tenant_id = $1::uuid AND branch_id = $2::uuid AND name = $3 AND day_of_week = 1
    `,
    selectParams: [tenantId, branchId, `${ns}-slot`],
    insertSql: `
      INSERT INTO time_slots (tenant_id, branch_id, name, day_of_week, start_time, end_time, order_index, status)
      VALUES ($1::uuid, $2::uuid, $3, 1, '10:00', '11:00', 1, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, branchId, `${ns}-slot`],
  });

  return Object.freeze({
    tenantId,
    branchId,
    branchCode,
    opsUser,
    teacherUser,
    teacherId,
    teacherBranchId,
    courseId: columnText(course, 'id', `courses.code=${ns}-course`),
    roomId: columnText(room, 'id', `rooms.code=${ns}-room`),
    studentGroupId: columnText(studentGroup, 'id', `student_groups.code=${ns}-group`),
    timeSlotId: columnText(timeSlot, 'id', `time_slots.name=${ns}-slot`),
  });
}

export function describeFixtureError(error: unknown): string {
  if (error instanceof FixtureContractError) return error.message;
  return redactDatabaseError(error);
}

/**
 * N3 kabul önkoşulu: öğrenci "kim" verisidir (yoklama/bildirim satırı
 * ÜRETMEZ). Ürün yüzeyinde öğrenci CRUD API'si bulunmadığından N3 harness'ı
 * önkoşul öğrencilerini yalnız bu referans SQL yolundan ekler.
 */
export type StudentFixture = Readonly<{
  studentId: string;
  studentCode: string;
}>;

export type SeedStudentsInput = Readonly<{
  tenantId: string;
  branchId: string;
  /** Deterministik kod öneki (örn. 'n3'). */
  namespace: string;
  count: number;
}>;

export async function seedStudents(
  client: PgClient,
  input: SeedStudentsInput,
): Promise<ReadonlyArray<StudentFixture>> {
  const students: StudentFixture[] = [];
  for (let i = 1; i <= input.count; i += 1) {
    const studentCode = `${input.namespace}-student-${i}`;
    const student = await ensureRow(client, {
      table: 'students',
      label: `students.code=${studentCode}`,
      selectSql: `
        SELECT id::text AS id FROM students
        WHERE tenant_id = $1::uuid AND branch_id = $2::uuid AND student_code = $3 AND deleted_at IS NULL
      `,
      selectParams: [input.tenantId, input.branchId, studentCode],
      insertSql: `
        INSERT INTO students (tenant_id, branch_id, student_code, first_name, last_name, enrollment_status)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'active')
        RETURNING id::text AS id
      `,
      insertParams: [
        input.tenantId,
        input.branchId,
        studentCode,
        `${input.namespace} student`,
        `no${i}`,
      ],
    });
    students.push(
      Object.freeze({
        studentId: columnText(student, 'id', `students.code=${studentCode}`),
        studentCode,
      }),
    );
  }
  return Object.freeze(students);
}

export type ConsentFixture = Readonly<{
  studentId: string;
  subjectId: string;
  parentConsentId: string;
  parentConsentVersion: number;
  smsConsentId: string;
  smsConsentVersion: number;
}>;

export type SeedConsentPreconditionsInput = Readonly<{
  tenantId: string;
  students: ReadonlyArray<StudentFixture>;
  namespace: string;
}>;

/** consent_type → seed edilen channel değeri (onay otoritesinin girdisi). */
const CONSENT_CHANNEL_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  parent_notification: 'manual',
  sms_notification: 'sms',
});

const CONSENT_TYPES_FOR_NOTIFICATION: ReadonlyArray<string> = Object.freeze([
  'parent_notification',
  'sms_notification',
]);

type ConsentRowSnapshot = Readonly<{
  consentId: string;
  status: string;
  revokedAt: unknown;
  expiresAt: unknown;
  version: number;
}>;

function isConsentRowApproved(row: ConsentRowSnapshot): boolean {
  if (row.status !== 'approved' || row.revokedAt !== null) return false;
  if (row.expiresAt === null) return true;
  return new Date(row.expiresAt as string | Date).getTime() > Date.now();
}

async function readLatestConsent(
  client: PgClient,
  tenantId: string,
  subjectId: string,
  consentType: string,
): Promise<ConsentRowSnapshot | null> {
  const result = await client.query(
    `
      SELECT id::text AS id, status, revoked_at, expires_at, version
        FROM kvkk_consents
       WHERE tenant_id = $1::uuid AND subject_id = $2::uuid AND consent_type = $3
       ORDER BY version DESC, created_at DESC, id DESC
       LIMIT 1
    `,
    [tenantId, subjectId, consentType],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return Object.freeze({
    consentId: columnText(row, 'id', `kvkk_consents.consent_type=${consentType}`),
    status: columnText(row, 'status', `kvkk_consents.consent_type=${consentType}`),
    revokedAt: row.revoked_at ?? null,
    expiresAt: row.expires_at ?? null,
    version: Number(row.version ?? 1),
  });
}

async function ensureConsentSubject(
  client: PgClient,
  input: Readonly<{ tenantId: string; studentId: string }>,
): Promise<string> {
  assertReferenceWrite('kvkk_consent_subjects');

  const selectSql = `
    SELECT id::text AS id, status FROM kvkk_consent_subjects
    WHERE tenant_id = $1::uuid AND subject_ref_id = $2::uuid
      AND subject_type = 'student' AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const selectParams: ReadonlyArray<unknown> = [input.tenantId, input.studentId];

  const decide = async (row: PgRow): Promise<string> => {
    const subjectId = columnText(row, 'id', 'kvkk_consent_subjects.student');
    if (columnText(row, 'status', 'kvkk_consent_subjects.student') === 'active') {
      return subjectId;
    }
    const updated = await client.query(
      `
        UPDATE kvkk_consent_subjects SET status = 'active', updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid
        RETURNING id::text AS id
      `,
      [input.tenantId, subjectId],
    );
    return columnText(updated.rows[0], 'id', 'kvkk_consent_subjects.student re-activate');
  };

  const existing = await client.query(selectSql, selectParams);
  const found = existing.rows[0];
  if (found !== undefined) return decide(found);

  try {
    const inserted = await client.query(
      `
        INSERT INTO kvkk_consent_subjects (tenant_id, subject_type, subject_ref_id, status)
        VALUES ($1::uuid, 'student', $2::uuid, 'active')
        RETURNING id::text AS id
      `,
      [input.tenantId, input.studentId],
    );
    return columnText(inserted.rows[0], 'id', 'kvkk_consent_subjects.student');
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const retry = await client.query(selectSql, selectParams);
    const row = retry.rows[0];
    if (row === undefined) throw error;
    return decide(row);
  }
}

async function ensureApprovedConsent(
  client: PgClient,
  input: Readonly<{
    tenantId: string;
    subjectId: string;
    consentType: string;
    source: string;
  }>,
): Promise<Readonly<{ consentId: string; version: number }>> {
  assertReferenceWrite('kvkk_consents');
  const channel = CONSENT_CHANNEL_BY_TYPE[input.consentType];
  if (channel === undefined) {
    throw new FixtureContractError(
      `No seed channel mapping for consent type '${input.consentType}'.`,
    );
  }

  const regrant = async (row: ConsentRowSnapshot): Promise<Readonly<{ consentId: string; version: number }>> => {
    if (isConsentRowApproved(row)) {
      return Object.freeze({ consentId: row.consentId, version: row.version });
    }
    const updated = await client.query(
      `
        UPDATE kvkk_consents
           SET status = 'approved', revoked_at = NULL, expires_at = NULL,
               granted_at = now(), updated_at = now(), version = version + 1
         WHERE tenant_id = $1::uuid AND id = $2::uuid
         RETURNING id::text AS id, version
      `,
      [input.tenantId, row.consentId],
    );
    const out = updated.rows[0];
    return Object.freeze({
      consentId: columnText(out, 'id', `kvkk_consents.regrant=${input.consentType}`),
      version: Number(out.version),
    });
  };

  const latest = await readLatestConsent(
    client,
    input.tenantId,
    input.subjectId,
    input.consentType,
  );
  if (latest !== null) return regrant(latest);

  try {
    const inserted = await client.query(
      `
        INSERT INTO kvkk_consents
          (tenant_id, subject_id, consent_type, status, channel, source, granted_at, version)
        VALUES ($1::uuid, $2::uuid, $3, 'approved', $4, $5, now(), 1)
        RETURNING id::text AS id, version
      `,
      [input.tenantId, input.subjectId, input.consentType, channel, input.source],
    );
    const out = inserted.rows[0];
    return Object.freeze({
      consentId: columnText(out, 'id', `kvkk_consents.seed=${input.consentType}`),
      version: Number(out.version),
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const retry = await readLatestConsent(
      client,
      input.tenantId,
      input.subjectId,
      input.consentType,
    );
    if (retry === null) throw error;
    return regrant(retry);
  }
}

/**
 * N3 senaryo önkoşulu: öğrenci öznesi + `parent_notification` /
 * `sms_notification` onayları. İzin (consent) bir İŞ SONUCU değil, yetki
 * otoritesinin girdisidir; bu yüzden referans fixture olarak SQL ile seed
 * edilir. En güncel satır approved değilse (revoked/rejected/expired lineage)
 * yeniden onaylanır (version bump) — harness idempotent kalır.
 */
export async function seedConsentPreconditions(
  client: PgClient,
  input: SeedConsentPreconditionsInput,
): Promise<ReadonlyArray<ConsentFixture>> {
  const fixtures: ConsentFixture[] = [];
  for (const student of input.students) {
    const subjectId = await ensureConsentSubject(client, {
      tenantId: input.tenantId,
      studentId: student.studentId,
    });
    const parent = await ensureApprovedConsent(client, {
      tenantId: input.tenantId,
      subjectId,
      consentType: 'parent_notification',
      source: input.namespace,
    });
    const sms = await ensureApprovedConsent(client, {
      tenantId: input.tenantId,
      subjectId,
      consentType: 'sms_notification',
      source: input.namespace,
    });
    fixtures.push(
      Object.freeze({
        studentId: student.studentId,
        subjectId,
        parentConsentId: parent.consentId,
        parentConsentVersion: parent.version,
        smsConsentId: sms.consentId,
        smsConsentVersion: sms.version,
      }),
    );
  }
  return Object.freeze(fixtures);
}

export type ConsentRevokeResult = Readonly<{
  consentId: string;
  subjectId: string;
  /** Revoked satırın yeni lineage version'ı (dispatch bu sürümü raporlar). */
  version: number;
}>;

export type RevokeConsentInput = Readonly<{
  tenantId: string;
  studentId: string;
  consentType?: string;
}>;

/**
 * Senaryo 3: yetki otoritesi revoke işlemi. Yalnız en güncel (max-version)
 * satırı `revoked` yapar ve version bump eder; dispatch sonucu ÜRETMEZ.
 * `kvkk_consent_events`'e YAZMAZ (o tablo yalnız gerçek otorite yolundan
 * beslenir; harness-write-not-reference ihlali olurdu).
 */
export async function revokeConsent(
  client: PgClient,
  input: RevokeConsentInput,
): Promise<ConsentRevokeResult> {
  assertReferenceWrite('kvkk_consents');
  const consentType = input.consentType ?? 'parent_notification';

  const subject = await client.query(
    `
      SELECT id::text AS id FROM kvkk_consent_subjects
      WHERE tenant_id = $1::uuid AND subject_ref_id = $2::uuid
        AND subject_type = 'student' AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [input.tenantId, input.studentId],
  );
  const subjectRow = subject.rows[0];
  if (subjectRow === undefined) {
    throw new FixtureContractError(
      `No consent subject for student ${input.studentId}; run seedConsentPreconditions first.`,
    );
  }
  const subjectId = columnText(subjectRow, 'id', 'kvkk_consent_subjects.student');

  const latest = await readLatestConsent(client, input.tenantId, subjectId, consentType);
  if (latest === null) {
    throw new FixtureContractError(
      `No '${consentType}' consent row for student ${input.studentId}; run seedConsentPreconditions first.`,
    );
  }

  const updated = await client.query(
    `
      UPDATE kvkk_consents
         SET status = 'revoked', revoked_at = now(), updated_at = now(),
             version = version + 1
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text AS id, version
    `,
    [input.tenantId, latest.consentId],
  );
  const out = updated.rows[0];
  if (out === undefined) {
    throw new FixtureContractError(
      `Consent revoke failed for student ${input.studentId} (${consentType}).`,
    );
  }
  return Object.freeze({
    consentId: columnText(out, 'id', 'kvkk_consents.revoke'),
    subjectId,
    version: Number(out.version),
  });
}

export type AdditionalBranchFixture = Readonly<{
  branchId: string;
  branchCode: string;
}>;

export type SeedAdditionalBranchInput = Readonly<{
  tenantId: string;
  namespace: string;
}>;

/**
 * Senaryo 7 (izolasyon): mevcut A şubesinin yanına ikinci aktif şube.
 * Oversight rolleri tüm aktif şubeleri gördüğü için yalnız `branches`
 * satırı yeterlidir; öğretmen ataması gerekmez.
 */
export async function seedAdditionalBranch(
  client: PgClient,
  input: SeedAdditionalBranchInput,
): Promise<AdditionalBranchFixture> {
  const branchCode = `${input.namespace.toUpperCase()}-BRANCH-B`;
  const branch = await ensureRow(client, {
    table: 'branches',
    label: `branches.code=${branchCode}`,
    selectSql: `SELECT id::text AS id FROM branches WHERE tenant_id = $1::uuid AND code = $2`,
    selectParams: [input.tenantId, branchCode],
    insertSql: `
      INSERT INTO branches (tenant_id, name, code, status)
      VALUES ($1::uuid, $2, $3, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [input.tenantId, `${input.namespace} secondary branch`, branchCode],
  });
  return Object.freeze({
    branchId: columnText(branch, 'id', `branches.code=${branchCode}`),
    branchCode,
  });
}

