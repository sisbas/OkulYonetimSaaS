import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_ANY_KEY = 'permissions_any';

/** Tümü (AND) semantiği — @Permissions(...) anahtarlama kuralı. */
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Any-of (OR) semantiği — @PermissionsAny(...).
 *
 * Sözleşme (`docs/m3/schedule-contract-v2.md` §8) bazı uçları tek anahtara
 * bağlamaz: `GET /schedules/:scheduleId` "management draft-read VEYA published
 * read", `GET /schedules/published` "schedule:read VEYA schedule:own:read"
 * ister. AND ile OR'u aynı metadata'da karıştırmamak için ayrı anahtar kullanılır.
 * `@Permissions` ile birlikte kullanılabilir: önce tüm AND anahtarları, sonra en
 * az bir OR anahtarı gerekli olur. En az bir anahtar beklenir; boş beyan
 * default-deny'dır (PermissionGuard).
 */
export const PermissionsAny = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);
