import { countOccurrencesOnDate } from './leave-impact.types';

describe('#455 leave impact today projection', () => {
  const events = [
    { occurrenceDate: '2026-11-23' },
    { occurrenceDate: '2026-11-23' },
    { occurrenceDate: '2026-11-24' },
  ];

  it('counts only the occurrences that land on the requested operational day', () => {
    expect(countOccurrencesOnDate(events, '2026-11-23')).toBe(2);
    expect(countOccurrencesOnDate(events, '2026-11-24')).toBe(1);
  });

  it('returns zero for a day with no occurrences and for an empty projection', () => {
    expect(countOccurrencesOnDate(events, '2026-11-25')).toBe(0);
    expect(countOccurrencesOnDate([], '2026-11-23')).toBe(0);
  });

  it('never normalizes or interprets the date as an instant', () => {
    expect(countOccurrencesOnDate(events, '2026-11-23T00:00:00Z')).toBe(0);
    expect(countOccurrencesOnDate(events, '23.11.2026')).toBe(0);
  });
});
