/**
 * S0-A1 (#269 AC-1 / AC-2) — kabul kanıtı tablo sözleşmesi.
 *
 * Tek doğruluk kaynağı: referans-fixture seeder'ı yalnız `REFERENCE_TABLES`
 * listesine yazabilir; statik guard (`test/acceptance-guard`) ise
 * `JOB_OUTCOME_TABLES` listesine yapılan her yazma denemesini ihlal sayar.
 * İki liste burada birlikte tutulur; seeder ile guard birbirinden kopamaz.
 */

/**
 * Kabul akışı için izinli referans (master) tabloları: kurum, şube, kullanıcı,
 * rol bağlantısı, öğretmen, ders, oda, öğrenci grubu, zaman dilimi.
 *
 * Bu tablolar "kim/nerede/ne zaman" sorusunu tanımlar; bir işin SONUCUNU
 * (onaylı izin, yedek görevlendirme, yoklama, bildirim, program olayı) temsil
 * ETMEZ.
 */
export const REFERENCE_TABLES: ReadonlyArray<string> = Object.freeze([
  'branches',
  'courses',
  'rooms',
  'student_groups',
  'teacher_branches',
  'teacher_courses',
  'teachers',
  'tenant_memberships',
  'tenants',
  'time_slots',
  'user_roles',
  'users',
]);

/**
 * İş sonucu (business outcome) tabloları. Kabul testlerinde SQL ile
 * ÜRETİLEMEZ; yalnızca gerçek işlemsel yol (görünür UI / public API) üretir.
 */
export const JOB_OUTCOME_TABLES: ReadonlyArray<string> = Object.freeze([
  'attendance_records',
  'attendance_sessions',
  'leave_outbox_events',
  'leave_requests',
  'leave_substitution_assignments',
  'notification_logs',
  'notification_outbox',
  'schedule_events',
  'schedule_versions',
]);

/**
 * S0-A2 mekanizması: bu işareti taşıyan dosya "synthetic/legacy" sayılır,
 * kabul kanıtı OLAMAZ ve hiçbir workflow tarafından çalıştırılamaz.
 * İşaret yoksa guard ihlali raporlar.
 */
export const LEGACY_EXCLUSION_MARKER = 'ACCEPTANCE-EVIDENCE-EXCLUDED';

export function isReferenceTable(table: string): boolean {
  return REFERENCE_TABLES.includes(table.trim().toLowerCase());
}

export function isJobOutcomeTable(table: string): boolean {
  return JOB_OUTCOME_TABLES.includes(table.trim().toLowerCase());
}
