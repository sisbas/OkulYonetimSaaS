import { EntityManager } from 'typeorm';

import { AppDataSource } from '../data-source';

/**
 * #461 F1 — kabul kapısı için SENTETİK roster seed'i.
 *
 * Gerçek kişi verisi kullanılmaz. Mevcut tenant (`SEED_TENANT_SLUG`) içinde
 * demo şube + sınıf grubu + öğrenciler + aktif üyelikler oluşturur. Tüm
 * adımlar idempotenttir; ikinci çalıştırma satır çoğaltmaz.
 *
 * Örnek:
 *   SEED_TENANT_SLUG=system-seed SEED_BRANCH_CODE=DEMO \
 *   npm run db:seed:students
 */

export const DEFAULT_ROSTER_STUDENT_COUNT = 8;
export const MAX_ROSTER_STUDENT_COUNT = 60;

const FIRST_NAMES = [
  'Ada',
  'Bora',
  'Cem',
  'Deniz',
  'Ece',
  'Fikri',
  'Gizem',
  'Hale',
  'İpek',
  'Kaan',
  'Lale',
  'Mert',
  'Naz',
  'Onur',
  'Pelin',
  'Rüzgar',
];

const LAST_NAMES = [
  'Yılmaz',
  'Demir',
  'Kaya',
  'Işık',
  'Zorlu',
  'Ak',
  'Çelik',
  'Doğan',
  'Erdem',
  'Güneş',
  'Kurt',
  'Öztürk',
];

export type StudentRosterSeedInput = Readonly<{
  tenantSlug: string;
  branchCode: string;
  branchName: string;
  groupCode: string;
  groupName: string;
  studentCount: number;
}>;

export type StudentRosterSeedResult = Readonly<{
  tenantId: string;
  branchId: string;
  studentGroupId: string;
  studentCount: number;
  membershipCount: number;
}>;

export class StudentRosterSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudentRosterSeedError';
  }
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new StudentRosterSeedError(`${label} is required`);
  return normalized;
}

export function validateStudentRosterSeedInput(
  input: StudentRosterSeedInput,
): void {
  required(input.tenantSlug, 'tenantSlug (SEED_TENANT_SLUG)');
  required(input.branchCode, 'branchCode (SEED_BRANCH_CODE)');
  required(input.branchName, 'branchName (SEED_BRANCH_NAME)');
  required(input.groupCode, 'groupCode (SEED_GROUP_CODE)');
  required(input.groupName, 'groupName (SEED_GROUP_NAME)');
  if (
    !Number.isInteger(input.studentCount) ||
    input.studentCount < 1 ||
    input.studentCount > MAX_ROSTER_STUDENT_COUNT
  ) {
    throw new StudentRosterSeedError(
      `studentCount (SEED_STUDENT_COUNT) must be an integer between 1 and ${MAX_ROSTER_STUDENT_COUNT}`,
    );
  }
}

export function studentRosterSeedInputFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StudentRosterSeedInput {
  const rawCount = env.SEED_STUDENT_COUNT?.trim();
  const parsedCount = rawCount
    ? Number.parseInt(rawCount, 10)
    : DEFAULT_ROSTER_STUDENT_COUNT;
  const input: StudentRosterSeedInput = {
    tenantSlug: env.SEED_TENANT_SLUG?.trim() || 'system-seed',
    branchCode: env.SEED_BRANCH_CODE?.trim() || 'DEMO',
    branchName: env.SEED_BRANCH_NAME?.trim() || 'Demo Şube',
    groupCode: env.SEED_GROUP_CODE?.trim() || 'DEMO-9A',
    groupName: env.SEED_GROUP_NAME?.trim() || '9-A',
    studentCount: parsedCount,
  };
  validateStudentRosterSeedInput(input);
  return input;
}

async function findTenantId(manager: EntityManager, tenantSlug: string): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `SELECT id::text AS id FROM tenants
      WHERE slug = $1 AND status = 'active' AND deleted_at IS NULL`,
    [tenantSlug],
  );
  if (rows.length === 0) {
    throw new StudentRosterSeedError(
      `Tenant '${tenantSlug}' not found or not active. Run "npm run db:seed:permissions" first.`,
    );
  }
  return rows[0].id;
}

async function upsertBranch(
  manager: EntityManager,
  tenantId: string,
  code: string,
  name: string,
): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO branches (tenant_id, name, code, status)
     VALUES ($1::uuid, $2, $3, 'active')
     ON CONFLICT (tenant_id, code)
     DO UPDATE SET name = EXCLUDED.name, status = 'active', deleted_at = NULL, updated_at = now()
     RETURNING id::text AS id`,
    [tenantId, name, code],
  );
  return rows[0].id;
}

async function upsertGroup(
  manager: EntityManager,
  tenantId: string,
  branchId: string,
  code: string,
  name: string,
): Promise<string> {
  const existing: Array<{ id: string }> = await manager.query(
    `SELECT id::text AS id FROM student_groups
      WHERE tenant_id = $1::uuid AND branch_id = $2::uuid
        AND lower(code) = lower($3) AND deleted_at IS NULL`,
    [tenantId, branchId, code],
  );
  if (existing.length > 0) {
    await manager.query(
      `UPDATE student_groups
          SET name = $2, status = 'active', deactivated_at = NULL, updated_at = now()
        WHERE id = $1::uuid`,
      [existing[0].id, name],
    );
    return existing[0].id;
  }
  const inserted: Array<{ id: string }> = await manager.query(
    `INSERT INTO student_groups (tenant_id, branch_id, name, code, status)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'active')
     RETURNING id::text AS id`,
    [tenantId, branchId, name, code],
  );
  return inserted[0].id;
}

async function upsertStudent(
  manager: EntityManager,
  input: {
    tenantId: string;
    branchId: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  },
): Promise<string> {
  const existing: Array<{ id: string }> = await manager.query(
    `SELECT id::text AS id FROM students
      WHERE tenant_id = $1::uuid AND branch_id = $2::uuid
        AND lower(student_code) = lower($3) AND deleted_at IS NULL`,
    [input.tenantId, input.branchId, input.studentCode],
  );
  if (existing.length > 0) {
    await manager.query(
      `UPDATE students
          SET first_name = $2, last_name = $3, enrollment_status = 'active',
              deactivated_at = NULL, updated_at = now()
        WHERE id = $1::uuid`,
      [existing[0].id, input.firstName, input.lastName],
    );
    return existing[0].id;
  }
  const inserted: Array<{ id: string }> = await manager.query(
    `INSERT INTO students
       (tenant_id, branch_id, student_code, first_name, last_name, enrollment_status)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'active')
     RETURNING id::text AS id`,
    [
      input.tenantId,
      input.branchId,
      input.studentCode,
      input.firstName,
      input.lastName,
    ],
  );
  return inserted[0].id;
}

async function upsertMembership(
  manager: EntityManager,
  input: {
    tenantId: string;
    branchId: string;
    studentGroupId: string;
    studentId: string;
  },
): Promise<void> {
  await manager.query(
    `INSERT INTO student_group_members
       (tenant_id, branch_id, student_group_id, student_id, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'active')
     ON CONFLICT (tenant_id, student_group_id, student_id) WHERE deleted_at IS NULL
     DO UPDATE SET status = 'active', updated_at = now()`,
    [
      input.tenantId,
      input.branchId,
      input.studentGroupId,
      input.studentId,
    ],
  );
}

export async function seedStudentRoster(
  manager: EntityManager,
  rawInput: StudentRosterSeedInput,
): Promise<StudentRosterSeedResult> {
  validateStudentRosterSeedInput(rawInput);
  const tenantId = await findTenantId(manager, rawInput.tenantSlug);
  const branchId = await upsertBranch(
    manager,
    tenantId,
    rawInput.branchCode,
    rawInput.branchName,
  );
  const studentGroupId = await upsertGroup(
    manager,
    tenantId,
    branchId,
    rawInput.groupCode,
    rawInput.groupName,
  );

  for (let index = 1; index <= rawInput.studentCount; index += 1) {
    const firstName = FIRST_NAMES[(index - 1) % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(index - 1) % LAST_NAMES.length];
    const studentId = await upsertStudent(manager, {
      tenantId,
      branchId,
      studentCode: `${rawInput.groupCode}-S${String(index).padStart(3, '0')}`,
      firstName,
      lastName,
    });
    await upsertMembership(manager, {
      tenantId,
      branchId,
      studentGroupId,
      studentId,
    });
  }

  return {
    tenantId,
    branchId,
    studentGroupId,
    studentCount: rawInput.studentCount,
    membershipCount: rawInput.studentCount,
  };
}

async function main(): Promise<void> {
  const ownsConnection = !AppDataSource.isInitialized;
  const dataSource = AppDataSource.isInitialized
    ? AppDataSource
    : await AppDataSource.initialize();
  try {
    const result = await dataSource.transaction((manager) =>
      seedStudentRoster(manager, studentRosterSeedInputFromEnv()),
    );
    console.log(
      `Synthetic student roster ready: branch=${result.branchId} group=${result.studentGroupId} students=${result.studentCount}`,
    );
  } finally {
    if (ownsConnection && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `Student roster seed failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
