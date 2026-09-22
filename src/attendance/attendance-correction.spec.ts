import {
  ATTENDANCE_CORRECTION_REASON_CODES,
  assertAttendanceCorrectionReasonCode,
  isAttendanceCorrectionReasonCode,
} from './attendance-correction';

/**
 * Kontrollü düzeltme gerekçe sözlüğü (AC-4, #265): kapalı sözlük fail-closed
 * doğrulanır; serbest metin gerekçe kabul edilmez.
 */
describe('attendance correction reason vocabulary (AC-4)', () => {
  it('accepts every code in the closed vocabulary', () => {
    for (const code of ATTENDANCE_CORRECTION_REASON_CODES) {
      expect(isAttendanceCorrectionReasonCode(code)).toBe(true);
      expect(assertAttendanceCorrectionReasonCode(code)).toBe(code);
    }
  });

  it('rejects free-text and unknown codes', () => {
    expect(isAttendanceCorrectionReasonCode('öğrenci sonradan geldi')).toBe(false);
    expect(isAttendanceCorrectionReasonCode('')).toBe(false);
    expect(isAttendanceCorrectionReasonCode(null)).toBe(false);
    expect(isAttendanceCorrectionReasonCode(undefined)).toBe(false);
    expect(isAttendanceCorrectionReasonCode(42)).toBe(false);
    expect(() => assertAttendanceCorrectionReasonCode('serbest metin')).toThrow(
      /Geçersiz düzeltme gerekçe kodu/,
    );
  });
});
