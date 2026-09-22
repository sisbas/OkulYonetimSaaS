/**
 * Kontrollü düzeltme politikası (AC-4, #265).
 *
 * Kilitli (locked) bir yoklama oturumunda kayıt düzeltmesi serbest metinle
 * değil, **kapalı bir gerekçe kodu** ile yapılır: audit ve raporlama katmanı
 * PII taşımayan sabit bir sözlük üzerinden çalışır. Serbest metin gerekiyorsa
 * `notes` alanı kullanılır ve yazma yolunda KVKK maskesinden geçer
 * (`redactAttendanceNotes`).
 *
 * `LEAVE_IMPACT_REASON_CODES` (src/daily-operations/leave-impact.types.ts) ile
 * aynı desen: kapalı sözlük + tip daraltma yardımcıları.
 */
export const ATTENDANCE_CORRECTION_REASON_CODES = [
  'mis_selection',
  'late_arrival_update',
  'excused_document',
  'manager_review',
] as const;

export type AttendanceCorrectionReasonCode =
  (typeof ATTENDANCE_CORRECTION_REASON_CODES)[number];

export const ATTENDANCE_CORRECTION_REASON_CODE_MAX_LENGTH = 40;
export const ATTENDANCE_CORRECTION_NOTE_MAX_LENGTH = 280;

export function isAttendanceCorrectionReasonCode(
  value: unknown,
): value is AttendanceCorrectionReasonCode {
  return (
    typeof value === 'string' &&
    (ATTENDANCE_CORRECTION_REASON_CODES as readonly string[]).includes(value)
  );
}

/** Kapalı sözlük dışındaki gerekçe kodunu fail-closed reddeder. */
export function assertAttendanceCorrectionReasonCode(
  value: unknown,
): AttendanceCorrectionReasonCode {
  if (!isAttendanceCorrectionReasonCode(value)) {
    throw new Error(`Geçersiz düzeltme gerekçe kodu: ${String(value)}`);
  }
  return value;
}
