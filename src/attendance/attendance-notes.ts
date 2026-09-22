/**
 * Yoklama (attendance) serbest notu için KVKK yazma-yolu politikası (OKUL-04/#265).
 *
 * Tek kaynak: `redaction-registry` (`notes` alanı hassas anahtar olarak tanımlı).
 * Politika fail-closed'dur — serbest metin gövdesi PII (öğrenci/veli kimliği,
 * telefon, e-posta, sağlık notu) içerebileceği için kayıt katmanında ham metin
 * SAKLANMAZ; alan maskeli placeholder olarak yazılır.
 *
 * `attendance_records.notes` yazımı yalnızca bu fonksiyon üzerinden yapılmalıdır
 * (AttendanceService.mark + AttendanceSessionService.markRecord).
 */
import { redactValue } from '../kvkk/redaction-registry';

/**
 * Serbest notu KVKK maskesinden geçirir. Boş/`null` girdi `null` döner; ham
 * metin asla geri dönmez.
 */
export function redactAttendanceNotes(
  notes: string | null | undefined,
): string | null {
  if (!notes) return null;
  const masked = redactValue('notes', notes);
  return typeof masked === 'string' ? masked : String(masked);
}
