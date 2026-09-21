import { ForbiddenException } from '@nestjs/common';

/**
 * Yoklama gözetim rolleri (OKUL-06 / #265 AC-3: manager visibility).
 *
 * Rol kimlikleri `src/database/seeds/permissions.seed.ts` içindeki
 * `ROLE_PERMISSION_SEED` anahtarlarıyla aynıdır: `tenant_admin` tüm izinlere,
 * `operations_manager` tüm attendance izinlerine sahiptir.
 */
export const ATTENDANCE_OVERSIGHT_ROLE_IDS = ['operations_manager', 'tenant_admin'] as const;

/** `tenant-bootstrap.ts` ile aynı UUID sözleşmesi. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Route parametresi geçerli bir UUID mi?
 *
 * NestJS guard'ları controller pipe'larından ÖNCE çalışır: guard içinde
 * `ParseUUIDPipe` devrede değildir. Malformed bir değer doğrudan sorguya
 * giderse PostgreSQL uuid cast hatası verir ve 400 yerine 500 döner.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Yoklama işlemlerinin fail-closed aktör bağlamı.
 *
 * DİKKAT: `userId` JWT'deki `users.id`'dir; `AttendanceSession.teacherId` ise
 * `teachers.id`'dir ve bu iki UUID normalde FARKLIDIR. Bu yüzden `teacherId`
 * alanı `users.id -> teachers.id` eşlemesiyle sunucu tarafında çözülür
 * (`AttendanceAccessService`); öğretmen olmayan kullanıcılarda `null` olur.
 */
export type AttendanceActor = {
  userId: string;
  tenantId: string;
  roleIds: string[];
  teacherId: string | null;
};

export function hasAttendanceOversight(
  actor: Pick<AttendanceActor, 'roleIds'> | undefined | null,
): boolean {
  const roleIds = actor?.roleIds ?? [];
  return ATTENDANCE_OVERSIGHT_ROLE_IDS.some((roleId) => roleIds.includes(roleId));
}

/**
 * Nesne seviyesinde yetki (BOLA) — fail-closed.
 *
 * Gözetim rolleri kiracı içindeki tüm oturumları yönetir. Öğretmen yalnızca
 * çözümlenmiş `teachers.id`'si oturumun `teacherId`'siyle eşleşen oturum
 * üzerinde işlem yapabilir; öğretmen kimliği çözümlenemeyen aktör reddedilir.
 * Kiracı filtresi çağıran tarafta uygulanır (oturum aktörün tenant'ından yüklenir).
 */
export function assertAttendanceSessionAccess(
  actor: AttendanceActor | undefined | null,
  session: { teacherId: string },
): void {
  if (!actor?.userId) {
    throw new ForbiddenException('Kimlik doğrulaması gerekli');
  }
  if (hasAttendanceOversight(actor)) {
    return;
  }
  if (!actor.teacherId) {
    throw new ForbiddenException('Öğretmen kimliği çözümlenemedi');
  }
  if (session.teacherId !== actor.teacherId) {
    throw new ForbiddenException('Bu dersin yoklamasına erişim izniniz yok');
  }
}

