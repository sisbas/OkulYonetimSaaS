import { LeaveDurationType } from './leave-request.entity';
import {
  assertLeaveWindow,
  LEAVE_MAX_RANGE_DAYS,
  LeaveWindowError,
  localCalendarParts,
  resolveLeaveTimeZone,
} from './leave-window';

const ISTANBUL = 'Europe/Istanbul';

function expectCode(run: () => unknown, code: LeaveWindowError['code']): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(LeaveWindowError);
    expect((error as LeaveWindowError).code).toBe(code);
    return;
  }
  throw new Error(`expected LeaveWindowError(${code}) but nothing was thrown`);
}

/**
 * #263 AC-3 — geçerli takvim tarihleri, sınırlı aralık ve tenant saat dilimi.
 * Tüm kurallar tenant saat diliminde değerlendirilir; UTC'ye sessiz düşüş yok.
 */
describe('leave window contract (#263 AC-3)', () => {
  it('accepts an hourly leave on one local day', () => {
    const result = assertLeaveWindow({
      durationType: LeaveDurationType.HOURLY,
      startsAt: new Date('2026-09-14T07:00:00.000Z'),
      endsAt: new Date('2026-09-14T08:00:00.000Z'),
      timeZone: ISTANBUL,
    });

    expect(result.localDaySpan).toBe(0);
    expect(result.totalHours).toBe(1);
    expect(result.timeZone).toBe(ISTANBUL);
  });

  it('accepts an hourly leave that crosses local midnight', () => {
    // 20:30Z = 23:30 yerel; 22:00Z = 01:00 yerel (ertesi gün).
    const result = assertLeaveWindow({
      durationType: LeaveDurationType.HOURLY,
      startsAt: new Date('2026-09-14T20:30:00.000Z'),
      endsAt: new Date('2026-09-14T22:00:00.000Z'),
      timeZone: ISTANBUL,
    });

    expect(result.localDaySpan).toBe(1);
  });

  it('rejects an hourly leave longer than 24 hours', () => {
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: LeaveDurationType.HOURLY,
          startsAt: new Date('2026-09-14T07:00:00.000Z'),
          endsAt: new Date('2026-09-15T09:00:00.000Z'),
          timeZone: ISTANBUL,
        }),
      'HOURLY_RANGE_TOO_LONG',
    );
  });

  it('accepts a full-day leave aligned to local midnights', () => {
    const result = assertLeaveWindow({
      durationType: LeaveDurationType.FULL_DAY,
      startsAt: new Date('2026-09-13T21:00:00.000Z'),
      endsAt: new Date('2026-09-14T21:00:00.000Z'),
      timeZone: ISTANBUL,
    });

    expect(result.localDaySpan).toBe(1);
  });

  it('keeps full-day alignment correct across a DST transition', () => {
    // America/New_York 2026-03-08 02:00'de ileri alır: 03-08 yerel günü 23 saattir.
    const result = assertLeaveWindow({
      durationType: LeaveDurationType.FULL_DAY,
      startsAt: new Date('2026-03-08T05:00:00.000Z'),
      endsAt: new Date('2026-03-09T04:00:00.000Z'),
      timeZone: 'America/New_York',
    });

    expect(result.localDaySpan).toBe(1);
    expect(result.totalHours).toBe(23);
  });
});

describe('leave window alignment and bounds (#263 AC-3)', () => {
  it('rejects a full-day leave that is not midnight aligned', () => {
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: LeaveDurationType.FULL_DAY,
          startsAt: new Date('2026-09-14T07:00:00.000Z'),
          endsAt: new Date('2026-09-15T07:00:00.000Z'),
          timeZone: ISTANBUL,
        }),
      'FULL_DAY_NOT_ALIGNED',
    );
  });

  it('rejects a full-day leave that spans more than one local day', () => {
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: LeaveDurationType.FULL_DAY,
          startsAt: new Date('2026-09-13T21:00:00.000Z'),
          endsAt: new Date('2026-09-15T21:00:00.000Z'),
          timeZone: ISTANBUL,
        }),
      'FULL_DAY_NOT_ALIGNED',
    );
  });

  it('accepts a multi-day leave of three aligned local days', () => {
    const result = assertLeaveWindow({
      durationType: LeaveDurationType.MULTI_DAY,
      startsAt: new Date('2026-09-13T21:00:00.000Z'),
      endsAt: new Date('2026-09-16T21:00:00.000Z'),
      timeZone: ISTANBUL,
    });

    expect(result.localDaySpan).toBe(3);
  });

  it('rejects a single-day multi-day leave and a non-aligned multi-day leave', () => {
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: LeaveDurationType.MULTI_DAY,
          startsAt: new Date('2026-09-13T21:00:00.000Z'),
          endsAt: new Date('2026-09-14T21:00:00.000Z'),
          timeZone: ISTANBUL,
        }),
      'MULTI_DAY_NOT_ALIGNED',
    );
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: LeaveDurationType.MULTI_DAY,
          startsAt: new Date('2026-09-14T09:00:00.000Z'),
          endsAt: new Date('2026-09-16T09:00:00.000Z'),
          timeZone: ISTANBUL,
        }),
      'MULTI_DAY_NOT_ALIGNED',
    );
  });

  it('rejects an inverted or empty range', () => {
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: LeaveDurationType.HOURLY,
          startsAt: new Date('2026-09-14T08:00:00.000Z'),
          endsAt: new Date('2026-09-14T08:00:00.000Z'),
          timeZone: ISTANBUL,
        }),
      'INVALID_RANGE',
    );
  });

  it('bounds the total range', () => {
    const startsAt = new Date('2026-09-14T00:00:00.000Z');
    const endsAt = new Date(startsAt.getTime() + (LEAVE_MAX_RANGE_DAYS + 1) * 24 * 60 * 60 * 1000);
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: LeaveDurationType.MULTI_DAY,
          startsAt,
          endsAt,
          timeZone: ISTANBUL,
        }),
      'RANGE_TOO_LONG',
    );
  });

  it('fails closed on a missing or invalid time zone instead of silently using UTC', () => {
    expectCode(() => resolveLeaveTimeZone(null), 'INVALID_TIME_ZONE');
    expectCode(() => resolveLeaveTimeZone('   '), 'INVALID_TIME_ZONE');
    expectCode(() => resolveLeaveTimeZone('Mars/Olympus'), 'INVALID_TIME_ZONE');
    expect(resolveLeaveTimeZone(ISTANBUL)).toBe(ISTANBUL);
  });

  it('rejects an unsupported duration type', () => {
    expectCode(
      () =>
        assertLeaveWindow({
          durationType: 'half_day',
          startsAt: new Date('2026-09-14T07:00:00.000Z'),
          endsAt: new Date('2026-09-14T08:00:00.000Z'),
          timeZone: ISTANBUL,
        }),
      'UNKNOWN_DURATION',
    );
  });

  it('resolves local calendar parts in the tenant time zone', () => {
    expect(localCalendarParts(new Date('2026-09-14T21:30:00.000Z'), ISTANBUL)).toEqual({
      date: '2026-09-15',
      time: '00:30',
    });
  });
});

