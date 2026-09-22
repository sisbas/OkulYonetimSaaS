import { REDACTED } from '../kvkk/redaction-registry';
import { redactAttendanceNotes } from './attendance-notes';

/**
 * KVKK yazma-yolu politikası (AC-5, #265): serbest yoklama notu ham hâliyle
 * `attendance_records.notes` alanına yazılamaz.
 */
describe('redactAttendanceNotes (KVKK write-path policy)', () => {
  it('masks free-text that may contain PII', () => {
    const raw = 'Veli Ayşe Yılmaz arandı, 0532 000 00 00 numarasından döndü';
    const masked = redactAttendanceNotes(raw);

    expect(masked).toBe(REDACTED);
    expect(masked).not.toContain('0532');
    expect(masked).not.toContain('Yılmaz');
  });

  it('masks any non-empty note (fail-closed: registry field is sensitive)', () => {
    expect(redactAttendanceNotes('rahatsızlandı')).toBe(REDACTED);
    expect(redactAttendanceNotes('x')).toBe(REDACTED);
  });

  it('returns null for empty, null and undefined notes', () => {
    expect(redactAttendanceNotes(null)).toBeNull();
    expect(redactAttendanceNotes(undefined)).toBeNull();
    expect(redactAttendanceNotes('')).toBeNull();
  });
});
