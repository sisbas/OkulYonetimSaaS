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
  /** İkinci şube: çapraz-şube/negatif senaryolar için referans kapsam. */
  secondaryBranchId: string;
  secondaryBranchCode: string;
  opsUser: FixtureUser;
  teacherUser: FixtureUser;
  teacherId: string;
  /** Yedek aday öğretmen (R10-4/5 aday listesi) referansı. */
  candidateUser: FixtureUser;
  candidateTeacherId: string;
  courseId: string;
  roomId: string;
  studentGroupId: string;
  timeSlotId: string;
  /** Yoklama/roster ve bildirim taslağı için referans öğrenci kimlikleri. */
  studentIds: ReadonlyArray<string>;
  /** Veli referansı (iletişim alanları bilinçli olarak boş). */
  guardianId: string;
  /**
   * Seeder'ın gerçekten yazdığı tablolar (sıralı, tekil). Rapor bu listeyi
   * kullanır; `REFERENCE_TABLES` izin listesinden bağımsız olarak "ne yazıldı"
   * sorusunu kanıtlar.
   */
  seededTables: ReadonlyArray<string>;
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
 *
 * `journal` verilirse yazılan tablo adı kaydedilir; rapor "hangi tablolara
 * dokunuldu" sorusunu izin listesinden bağımsız olarak kanıtlar.
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
  journal?: Set<string>,
): Promise<PgRow> {
  assertReferenceWrite(input.table);
  journal?.add(input.table);

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
  journal?: Set<string>,
): Promise<FixtureUser> {
  const credentialHash = bcrypt.hashSync(input.credential, 10);

  const user = await ensureRow(
    client,
    {
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
    },
    journal,
  );
  const userId = columnText(user, 'id', `users.email=${input.email}`);

  await ensureRow(
    client,
    {
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
    },
    journal,
  );

  await ensureRow(
    client,
    {
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
    },
    journal,
  );

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
  const journal = new Set<string>();
  /** `ensureRow` + journal kısayolu: yazılan tablo rapor için kaydedilir. */
  const seed = (row: Parameters<typeof ensureRow>[1]): Promise<PgRow> =>
    ensureRow(client, row, journal);

  const branch = await seed({
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

  const opsUser = await ensureUser(
    client,
    {
      tenantId,
      email: `ops.${ns}@qa.invalid`,
      fullName: `${ns} operations manager`,
      employeeCode: `${ns}-ops`,
      credential: input.credential,
      roleCode: 'operations_manager',
      roleId: opsRoleId,
    },
    journal,
  );

  const teacherUser = await ensureUser(
    client,
    {
      tenantId,
      email: `teacher.${ns}@qa.invalid`,
      fullName: `${ns} teacher`,
      employeeCode: `${ns}-teacher`,
      credential: input.credential,
      roleCode: 'teacher',
      roleId: teacherRoleId,
    },
    journal,
  );

  const teacher = await seed({
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

  await seed({
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

  const course = await seed({
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
  const courseId = columnText(course, 'id', `courses.code=${ns}-course`);

  const room = await seed({
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

  const studentGroup = await seed({
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

  const timeSlot = await seed({
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

  // ---- F1 genişletmesi: journey için ek REFERANS varlıklar ----
  // Hepsi "kim/nerede/ne zaman" sorusunu tanımlar; iş sonucu ÜRETMEZ.

  // Öğretmenin DERS UYGUNLUĞU referansı: aday listesi yalnız aktif ders
  // ataması olan öğretmeni "uygun" sayar (#263 impact/candidate kapısı).
  await seed({
    table: 'teacher_courses',
    label: `teacher_courses(${ns}-teacher -> ${ns}-course)`,
    selectSql: `
      SELECT id::text AS id FROM teacher_courses
      WHERE tenant_id = $1::uuid AND teacher_id = $2::uuid AND course_id = $3::uuid AND status = 'active'
    `,
    selectParams: [tenantId, teacherId, courseId],
    insertSql: `
      INSERT INTO teacher_courses (tenant_id, teacher_id, course_id, status, effective_from, effective_to)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, teacherId, courseId],
  });

  // Yedek aday öğretmen (R10-4/5): aynı ders için uygun, ayrı kullanıcı.
  const candidateUser = await ensureUser(
    client,
    {
      tenantId,
      email: `substitute.${ns}@qa.invalid`,
      fullName: `${ns} substitute teacher`,
      employeeCode: `${ns}-substitute`,
      credential: input.credential,
      roleCode: 'teacher',
      roleId: teacherRoleId,
    },
    journal,
  );

  const candidateTeacher = await seed({
    table: 'teachers',
    label: `teachers.employee_code=${ns}-substitute`,
    selectSql: `SELECT id::text AS id FROM teachers WHERE tenant_id = $1::uuid AND employee_code = $2`,
    selectParams: [tenantId, `${ns}-substitute`],
    insertSql: `
      INSERT INTO teachers (tenant_id, user_id, employee_code, first_name, last_name, status)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, candidateUser.userId, `${ns}-substitute`, ns, 'substitute'],
  });
  const candidateTeacherId = columnText(
    candidateTeacher,
    'id',
    `teachers.employee_code=${ns}-substitute`,
  );

  await seed({
    table: 'teacher_branches',
    label: `teacher_branches(${ns}-substitute)`,
    selectSql: `
      SELECT id::text AS id FROM teacher_branches
      WHERE tenant_id = $1::uuid AND teacher_id = $2::uuid AND branch_id = $3::uuid AND status = 'active'
    `,
    selectParams: [tenantId, candidateTeacherId, branchId],
    insertSql: `
      INSERT INTO teacher_branches (tenant_id, teacher_id, branch_id, status, effective_from, effective_to)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, candidateTeacherId, branchId],
  });

  await seed({
    table: 'teacher_courses',
    label: `teacher_courses(${ns}-substitute -> ${ns}-course)`,
    selectSql: `
      SELECT id::text AS id FROM teacher_courses
      WHERE tenant_id = $1::uuid AND teacher_id = $2::uuid AND course_id = $3::uuid AND status = 'active'
    `,
    selectParams: [tenantId, candidateTeacherId, courseId],
    insertSql: `
      INSERT INTO teacher_courses (tenant_id, teacher_id, course_id, status, effective_from, effective_to)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', CURRENT_DATE - INTERVAL '1 day', NULL)
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, candidateTeacherId, courseId],
  });

  // İkinci şube: çapraz-şube ve negatif senaryoların referans kapsamı.
  const secondaryBranchCode = `${ns.toUpperCase()}-BRANCH-2`;
  const secondaryBranch = await seed({
    table: 'branches',
    label: `branches.code=${secondaryBranchCode}`,
    selectSql: `SELECT id::text AS id FROM branches WHERE tenant_id = $1::uuid AND code = $2`,
    selectParams: [tenantId, secondaryBranchCode],
    insertSql: `
      INSERT INTO branches (tenant_id, name, code, status)
      VALUES ($1::uuid, $2, $3, 'active')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, `${ns} secondary reference branch`, secondaryBranchCode],
  });
  const secondaryBranchId = columnText(
    secondaryBranch,
    'id',
    `branches.code=${secondaryBranchCode}`,
  );

  // Roster için referans öğrenciler. Ad alanları bilinçli olarak "sentetik
  // kod" biçimindedir: gerçek kişiye benzeyen bir değer üretilmez.
  const studentIds: string[] = [];
  for (const index of [1, 2, 3]) {
    const studentCode = `${ns}-student-${index}`;
    const student = await seed({
      table: 'students',
      label: `students.student_code=${studentCode}`,
      selectSql: `
        SELECT id::text AS id FROM students
        WHERE tenant_id = $1::uuid AND branch_id = $2::uuid AND student_code = $3
      `,
      selectParams: [tenantId, branchId, studentCode],
      insertSql: `
        INSERT INTO students (tenant_id, branch_id, student_code, first_name, last_name, enrollment_status, enrollment_date)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'active', CURRENT_DATE)
        RETURNING id::text AS id
      `,
      insertParams: [tenantId, branchId, studentCode, studentCode, 'reference'],
    });
    studentIds.push(columnText(student, 'id', `students.student_code=${studentCode}`));
  }

  // Veli referansı (R10-7 bildirim taslağı). İletişim alanları bilinçli olarak
  // BOŞTUR: artefaktlarda maskesiz PII riskini sıfırlar.
  const primaryStudentId = studentIds[0];
  const guardian = await seed({
    table: 'guardians',
    label: `guardians(${ns} -> ${primaryStudentId})`,
    selectSql: `
      SELECT id::text AS id FROM guardians
      WHERE tenant_id = $1::uuid AND student_id = $2::uuid AND full_name = $3
    `,
    selectParams: [tenantId, primaryStudentId, `guardian.${ns}`],
    insertSql: `
      INSERT INTO guardians (tenant_id, student_id, full_name, relationship)
      VALUES ($1::uuid, $2::uuid, $3, 'guardian')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId, primaryStudentId, `guardian.${ns}`],
  });

  // Kurum konfigürasyonu (referans): timezone/locale + bildirim modu.
  await seed({
    table: 'tenant_settings',
    label: `tenant_settings(${tenantId})`,
    selectSql: `SELECT id::text AS id FROM tenant_settings WHERE tenant_id = $1::uuid`,
    selectParams: [tenantId],
    insertSql: `
      INSERT INTO tenant_settings (tenant_id, timezone, locale, notification_mode, kvkk_mode)
      VALUES ($1::uuid, 'Europe/Istanbul', 'tr-TR', 'manual', 'strict')
      RETURNING id::text AS id
    `,
    insertParams: [tenantId],
  });

  return Object.freeze({
    tenantId,
    branchId,
    branchCode,
    secondaryBranchId,
    secondaryBranchCode,
    opsUser,
    teacherUser,
    teacherId,
    candidateUser,
    candidateTeacherId,
    courseId,
    roomId: columnText(room, 'id', `rooms.code=${ns}-room`),
    studentGroupId: columnText(studentGroup, 'id', `student_groups.code=${ns}-group`),
    timeSlotId: columnText(timeSlot, 'id', `time_slots.name=${ns}-slot`),
    studentIds: Object.freeze(studentIds),
    guardianId: columnText(guardian, 'id', `guardians(${ns})`),
    seededTables: Object.freeze([...journal].sort()),
  });
}

export function describeFixtureError(error: unknown): string {
  if (error instanceof FixtureContractError) return error.message;
  return redactDatabaseError(error);
}

