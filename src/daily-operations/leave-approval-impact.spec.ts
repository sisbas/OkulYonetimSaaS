import { LeaveCoverageStatus } from '../leaves/leave-request.entity';
import {
  CANDIDATE_DECISION_SUPPORT_DETAIL,
  LEAVE_APPROVAL_FORBIDDEN_FIELD_FRAGMENTS,
  LEAVE_APPROVAL_RAW_IDENTIFIER_FIELD_PATTERN,
  LEAVE_APPROVAL_RESPONSE_FIELDS,
  LEAVE_APPROVAL_LESSON_FIELDS,
  LEAVE_APPROVAL_CANDIDATE_FIELDS,
  LEAVE_ZERO_IMPACT_CODES,
  composeLessonLabel,
  coverageLabel,
  formatOccurrenceLabel,
  formatTimeLabel,
  lessonStateLabel,
  zeroImpactDetailFor,
} from './leave-approval-impact';
import { LEAVE_DECISION_RESPONSE_FIELDS } from '../leaves/leave-decision-labels';

describe('R1 leave approval impact labels', () => {
  it('renders readable lesson and time labels without raw identifiers', () => {
    expect(formatOccurrenceLabel('2026-09-14')).toBe('14.09.2026');
    expect(formatTimeLabel('09:00:00', '10:00:00')).toBe('09:00–10:00');
    expect(
      composeLessonLabel({
        courseLabel: 'Matematik',
        groupLabel: '5-A',
        timeLabel: '09:00–10:00',
        occurrenceLabel: '14.09.2026',
      }),
    ).toBe('Matematik · 5-A · 09:00–10:00 · 14.09.2026');
  });

  it('describes coverage and lesson state in Turkish, not as raw codes', () => {
    expect(coverageLabel(LeaveCoverageStatus.NOT_REQUIRED)).toBe('Karşılık gerekmiyor');
    expect(coverageLabel(LeaveCoverageStatus.UNRESOLVED)).toBe('Karşılık bekliyor');
    expect(coverageLabel(LeaveCoverageStatus.PARTIALLY_COVERED)).toBe('Kısmen karşılandı');
    expect(coverageLabel(LeaveCoverageStatus.COVERED)).toBe('Karşılandı');
    expect(lessonStateLabel('open')).toBe('Açık');
    expect(lessonStateLabel('resolved')).toBe('Karşılandı');
  });

  it('states every zero-impact reason explicitly', () => {
    for (const code of LEAVE_ZERO_IMPACT_CODES) {
      const detail = zeroImpactDetailFor(code);
      expect(detail.length).toBeGreaterThan(30);
      expect(detail).toContain('etkilenen ders yok');
    }
    expect(zeroImpactDetailFor('NO_PUBLISHED_SCHEDULE_EVENT')).toContain('yayınlanmış ders programı');
    expect(zeroImpactDetailFor('NO_OVERLAPPING_OCCURRENCE')).toContain('denk gelen oturum');
  });

  it('pins the decision and impact response allowlists as identifier-free', () => {
    const fields = [
      ...LEAVE_DECISION_RESPONSE_FIELDS,
      ...LEAVE_APPROVAL_RESPONSE_FIELDS,
      ...LEAVE_APPROVAL_LESSON_FIELDS,
      ...LEAVE_APPROVAL_CANDIDATE_FIELDS,
    ];
    for (const field of fields) {
      expect(LEAVE_APPROVAL_RAW_IDENTIFIER_FIELD_PATTERN.test(field)).toBe(false);
      for (const fragment of LEAVE_APPROVAL_FORBIDDEN_FIELD_FRAGMENTS) {
        expect(field.toLowerCase()).not.toContain(fragment.toLowerCase());
      }
    }
    expect(CANDIDATE_DECISION_SUPPORT_DETAIL).toContain('karar desteği');
  });
});
