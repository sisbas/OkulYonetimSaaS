import { ForbiddenException } from '@nestjs/common';

/**
 * Yoklama gözetim rolleri (OKUL-06 / #265 AC-3: manager visibility).
 *
 * Rol kimlikleri `src/database/seeds/permissions.seed.ts` içindeki
 * `ROLE_PERMISSION_SEED` anahtarlarıyla aynıdır: `tenant_admin` tüm izinlere,
 * `operations_manager` tüm attendance izinlerine sahiptir. Önceki guard
 * sürümü var olmayan bir `manager` rol kimliğine baktığı için gözetim kontrolü
 * hiçbir zaman doğru çalışmıyordu.
 */
export const ATTENDANCE_OVERSIGHT_ROLE_IDS = ['operations_manager', 'tenant_admin'] as const;

/**
 * Yoklama işlemlerinin fail-closed aktör bağlamı. `tenantId` zorunludur:
 * oturumlar yalnız aktörün kiracısından yüklenir (cross-tenant erişim yok).
 */
export type AttendanceActor = {
  userId: string;
  tenantId: string;
  roleIds: string[];
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
 * Bir öğretmen yalnızca kendi `teacherId`'sine ait oturum üzerinde işlem
 * yapabilir; gözetim rolleri kiracı içindeki tüm oturumları yönetebilir.
 * Kiracı filtresi çağıran tarafta uygulanır: oturum yalnız aktörün
 * `tenantId`'si ile yüklenir, bu yüzden burada sahiplik karşılaştırılır.
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
  if (session.teacherId !== actor.userId) {
    throw new ForbiddenException('Bu dersin yoklamasına erişim izniniz yok');
  }
}
