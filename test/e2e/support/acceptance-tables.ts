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
 * rol bağlantısı, öğretmen, ders, oda, öğrenci grubu, zaman dilimi, öğrenci ve
 * veli kimliği.
 *
 * Bu tablolar "kim/nerede/ne zaman" sorusunu tanımlar; bir işin SONUCUNU
 * (onaylı izin, yedek görevlendirme, yoklama, bildirim, program olayı) temsil
 * ETMEZ.
 */
export const REFERENCE_TABLES: ReadonlyArray<string> = Object.freeze([
  'branches',
  'courses',
  'guardians',
  'permissions',
  'role_permissions',
  'roles',
  'rooms',
  'student_groups',
  'students',
  'teacher_branches',
  'teacher_courses',
  'teachers',
  'tenant_memberships',
  'tenant_settings',
  'tenants',
  'time_slots',
  'user_roles',
  'users',
]);

/**
 * İş sonucu (business outcome) tabloları. Kabul testlerinde SQL ile
 * ÜRETİLEMEZ; yalnızca gerçek işlemsel yol (görünür UI / public API) üretir.
 *
 * F1 genişletmesi: journey'in dokunduğu yeni yüzeyler eklendi — program
 * başlığı (`schedules`), günlük operasyon kuyruğu (`daily_operation_lessons`),
 * rapor koşuları (`report_runs`) ve KVKK rıza kayıtları (`kvkk_*`).
 */
export const JOB_OUTCOME_TABLES: ReadonlyArray<string> = Object.freeze([
  'attendance_records',
  'attendance_sessions',
  'daily_operation_lessons',
  'kvkk_consent_events',
  'kvkk_consent_subjects',
  'kvkk_consents',
  'leave_outbox_events',
  'leave_requests',
  'leave_substitution_assignments',
  'notification_logs',
  'notification_outbox',
  'report_runs',
  'schedule_events',
  'schedule_versions',
  'schedules',
]);

/**
 * R10 journey adımlarının beklediği iş sonucu tabloları — TEK doğruluk
 * kaynağı (F1 genişletmesi).
 *
 * Neden burada: bir adımın hangi iş sonucu tablosunu ürettiğini adım
 * tanımının içine yazmak, `JOB_OUTCOME_TABLES`'ın elle tutulan İKİNCİ bir
 * kopyasını yaratır ve sessizce ayrışabilir. Journey sözleşmesi bu haritayı
 * import eder; `assertJourneyOutcomeMembership` her girdinin kanonik listede
 * olduğunu fail-closed doğrular.
 */
export const JOURNEY_OUTCOME_TABLES: Readonly<Record<string, ReadonlyArray<string>>> =
  Object.freeze({
    'schedule-publish': Object.freeze(['schedules', 'schedule_versions', 'schedule_events']),
    'leave-request': Object.freeze(['leave_requests']),
    'manager-approval': Object.freeze(['leave_requests']),
    'impact-candidates': Object.freeze(['leave_requests', 'leave_substitution_assignments']),
    'candidate-assign-clear': Object.freeze(['leave_substitution_assignments']),
    'attendance-lock': Object.freeze(['attendance_sessions', 'attendance_records']),
    'notification-draft': Object.freeze(['notification_outbox', 'notification_logs']),
  });

/**
 * Adım başına beklenen tabloların kanonik iş sonucu listesinin ALT KÜMESİ
 * olduğunu doğrular. Ayrışma (ör. `schedules` kanonik listeden çıkarıldı ama
 * adım hâlâ onu bekliyor) sessizce geçemez.
 */
export function assertJourneyOutcomeMembership(label: string, tables: ReadonlyArray<string>): void {
  if (tables.length === 0) {
    throw new Error(`${label} declares no job-outcome table.`);
  }
  for (const table of tables) {
    if (!JOB_OUTCOME_TABLES.includes(table)) {
      throw new Error(
        `${label} expects job-outcome table '${table}' which is not in JOB_OUTCOME_TABLES; ` +
          'the step expectation and the canonical contract drifted apart.',
      );
    }
  }
}

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
