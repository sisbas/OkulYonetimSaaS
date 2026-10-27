import * as bcrypt from 'bcryptjs';
import { EntityManager } from 'typeorm';

import { AppDataSource } from '../data-source';

/**
 * #388 K-11 — ilk kullanıcı bootstrap seed'i.
 *
 * Fresh kurulumda (boş users tablosu) ilk girilebilir yöneticiyi yaratır:
 * users + tenant_memberships(active) + user_roles(tenant_admin).
 * HTTP yüzeyi YOKTUR; yalnız CLI seed yolu. Fail-closed:
 * - kullanıcılar zaten varsa (hedef e-posta hariç) reddeder,
 * - hedef e-posta mevcutsa ve giriş yapabiliyorsa idempotent "already-exists" döner,
 * - hedef hesap soft-delete edilmişse (kullanıcı veya üyelik) "repaired" ile geri yüklenir,
 * - hedef hesap başka bir nedenle giriş yapamıyorsa reddeder,
 * - tenant veya tenant_admin rolü yoksa `db:seed:permissions` ipucuyla reddeder,
 * - zayıf/eksik parola, e-posta, ad alanlarını reddeder.
 */

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
const DEFAULT_ADMIN_FULL_NAME = 'Kurum Yöneticisi';
const DEFAULT_SEED_TENANT_SLUG = 'system-seed';
const BCRYPT_COST = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminSeedInput = Readonly<{
  tenantSlug: string;
  email: string;
  password: string;
  fullName: string;
}>;

export type AdminSeedOutcome = 'created' | 'already-exists' | 'repaired';

export type AdminSeedResult = Readonly<{
  outcome: AdminSeedOutcome;
  userId: string;
}>;

export type ExistingAccountState = Readonly<{
  userSoftDeleted: boolean;
  userStatus: string;
  membership: Readonly<{ status: string; softDeleted: boolean }> | null;
  hasRole: boolean;
}>;

export type ExistingAccountDecision =
  | 'already-exists'
  | 'repair-user'
  | 'repair-membership'
  | 'not-loginable';

export class AdminSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminSeedError';
  }
}

export function validateAdminSeedInput(input: AdminSeedInput): void {
  if (input.tenantSlug.trim().length === 0) {
    throw new AdminSeedError('tenantSlug is required');
  }
  if (!EMAIL_PATTERN.test(input.email.trim())) {
    throw new AdminSeedError('A valid email is required (SEED_ADMIN_EMAIL)');
  }
  if (input.password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new AdminSeedError(
      `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters (SEED_ADMIN_PASSWORD)`,
    );
  }
  if (input.fullName.trim().length === 0) {
    throw new AdminSeedError('fullName is required (SEED_ADMIN_FULL_NAME)');
  }
}

/**
 * #465 — mevcut hesap için bootstrap kararı. Auth yolundaki (#388) soft-delete
 * koşullarını aynen uygular: soft-delete edilmiş kullanıcı veya üyelik "yok"
 * sayılır. "already-exists" yalnızca gerçekten giriş yapabilen hesap için döner;
 * böylece seed, kimlik doğrulayamayan bir hesabı başarı gibi raporlamaz.
 *
 * Üyelik onarımı kimlik bilgilerine dokunmaz (parola geçerli kalır); kullanıcı
 * onarımı parolayı yeniler ve token_version'ı artırır.
 */
export function decideExistingAccount(state: ExistingAccountState): ExistingAccountDecision {
  if (state.userSoftDeleted) return 'repair-user';
  if (state.userStatus !== 'active') return 'not-loginable';
  if (!state.membership) return 'not-loginable';
  if (state.membership.softDeleted) return 'repair-membership';
  if (state.membership.status !== 'active') return 'not-loginable';
  if (!state.hasRole) return 'not-loginable';
  return 'already-exists';
}

async function restoreMembershipAndRole(
  manager: EntityManager,
  tenantId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await manager.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, status)
     VALUES ($1::uuid, $2::uuid, 'active')
     ON CONFLICT (tenant_id, user_id)
     DO UPDATE SET status = 'active', deleted_at = NULL, updated_at = now()`,
    [tenantId, userId],
  );
  await manager.query(
    `INSERT INTO user_roles (tenant_id, user_id, role_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid)
     ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
    [tenantId, userId, roleId],
  );
}

/**
 * Seed mantığı. TypeORM transaction manager'ı ile çalışır; CLI sarmalayıcı
 * transaction'ı açar, testler doğrudan çağırır.
 */
export async function seedFirstAdminUser(
  manager: EntityManager,
  input: AdminSeedInput,
): Promise<AdminSeedResult> {
  validateAdminSeedInput(input);
  // Login e-postayı lower-case eşler (auth.service); idempotency aynı biçimde normalize eder.
  const email = input.email.trim().toLowerCase();
  const tenantSlug = input.tenantSlug.trim();
  const fullName = input.fullName.trim();

  const tenantRows: Array<{ id: string }> = await manager.query(
    `SELECT id::text AS id FROM tenants WHERE slug = $1 AND status = 'active' AND deleted_at IS NULL`,
    [tenantSlug],
  );
  if (tenantRows.length === 0) {
    throw new AdminSeedError(
      `Tenant '${tenantSlug}' not found or not active. Run "npm run db:seed:permissions" first.`,
    );
  }
  const tenantId = tenantRows[0].id;

  const roleRows: Array<{ id: string }> = await manager.query(
    `SELECT id::text AS id FROM roles WHERE tenant_id = $1::uuid AND name = 'tenant_admin' AND deleted_at IS NULL`,
    [tenantId],
  );
  if (roleRows.length === 0) {
    throw new AdminSeedError(
      `Role 'tenant_admin' not found in tenant '${tenantSlug}'. Run "npm run db:seed:permissions" first.`,
    );
  }
  const roleId = roleRows[0].id;

  const existingRows: Array<{ id: string; status: string; softDeleted: boolean }> = await manager.query(
    `SELECT id::text AS id, status, (deleted_at IS NOT NULL) AS "softDeleted"
       FROM users WHERE email = $1`,
    [email],
  );
  if (existingRows.length > 0) {
    const existingUserId = existingRows[0].id;
    const membershipRows: Array<{ status: string; softDeleted: boolean }> = await manager.query(
      `SELECT status, (deleted_at IS NOT NULL) AS "softDeleted"
         FROM tenant_memberships
        WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [tenantId, existingUserId],
    );
    const rolePresenceRows: Array<{ ok: boolean }> = await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM user_roles
          WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = $3::uuid
       ) AS ok`,
      [tenantId, existingUserId, roleId],
    );

    const decision = decideExistingAccount({
      userSoftDeleted: existingRows[0].softDeleted,
      userStatus: existingRows[0].status,
      membership:
        membershipRows.length > 0
          ? { status: membershipRows[0].status, softDeleted: membershipRows[0].softDeleted }
          : null,
      hasRole: rolePresenceRows[0].ok,
    });

    if (decision === 'already-exists') {
      return Object.freeze({ outcome: 'already-exists' as const, userId: existingUserId });
    }
    if (decision === 'not-loginable') {
      throw new AdminSeedError(
        `User '${email}' exists but is not loginable: it needs active status, an active tenant membership and the tenant_admin role.`,
      );
    }
    if (decision === 'repair-user') {
      const credentialHash = bcrypt.hashSync(input.password, BCRYPT_COST);
      // Parola yenilendiği için mevcut oturumlar token_version ile geçersizleşir.
      // full_name kasıtlı olarak korunur: bootstrap yeniden çalıştırması hesabı
      // yeniden adlandırmamalıdır.
      await manager.query(
        `UPDATE users
            SET status = 'active', deleted_at = NULL, credential_hash = $2,
                token_version = token_version + 1, updated_at = now()
          WHERE id = $1::uuid`,
        [existingUserId, credentialHash],
      );
    }
    await restoreMembershipAndRole(manager, tenantId, existingUserId, roleId);
    return Object.freeze({ outcome: 'repaired' as const, userId: existingUserId });
  }

  const userCountRows: Array<{ n: number }> = await manager.query(
    `SELECT count(*)::int AS n FROM users`,
  );
  if (userCountRows[0].n > 0) {
    throw new AdminSeedError(
      'Users already exist; this seed is first-user bootstrap only and refuses to create additional admins.',
    );
  }

  const credentialHash = bcrypt.hashSync(input.password, BCRYPT_COST);
  const insertedRows: Array<{ id: string }> = await manager.query(
    `INSERT INTO users (email, credential_hash, full_name, status, token_version)
     VALUES ($1, $2, $3, 'active', 1)
     RETURNING id::text AS id`,
    [email, credentialHash, fullName],
  );
  const userId = insertedRows[0].id;

  await restoreMembershipAndRole(manager, tenantId, userId, roleId);

  return Object.freeze({ outcome: 'created' as const, userId });
}

/**
 * CLI sarmalayıcı: env girdilerini okur, tek transaction içinde çalıştırır.
 */
export async function runAdminSeedFromEnv(): Promise<AdminSeedResult> {
  const input: AdminSeedInput = {
    tenantSlug: process.env.SEED_TENANT_SLUG ?? DEFAULT_SEED_TENANT_SLUG,
    email: process.env.SEED_ADMIN_EMAIL ?? '',
    password: process.env.SEED_ADMIN_PASSWORD ?? '',
    fullName: process.env.SEED_ADMIN_FULL_NAME ?? DEFAULT_ADMIN_FULL_NAME,
  };

  const ownsConnection = !AppDataSource.isInitialized;
  const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();
  try {
    return await ds.transaction((manager) => seedFirstAdminUser(manager, input));
  } finally {
    if (ownsConnection && ds.isInitialized) await ds.destroy();
  }
}

if (require.main === module) {
  runAdminSeedFromEnv()
    .then((result) => {
      if (result.outcome === 'created') {
        console.log(`First admin user created (id=${result.userId})`);
      } else if (result.outcome === 'repaired') {
        console.log(`Admin user repaired (id=${result.userId}); login access restored`);
      } else {
        console.log(`Admin user already exists (id=${result.userId}); skipped`);
      }
    })
    .catch((error) => {
      console.error(`Admin seed failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
