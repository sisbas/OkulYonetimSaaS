import { HttpStatus } from '@nestjs/common';

import {
  IF_MATCH_HEADER,
  ScheduleVersionMismatchException,
  ScheduleVersionRequiredException,
  assertScheduleIfMatchResource,
  parseScheduleIfMatch,
  scheduleEtag,
} from '../../src/schedules/schedule-revision';

describe('#447 Schedule conditional revision (If-Match) helper', () => {
  const ID = '00000000-0000-4000-8000-000000000001';

  it('roundtrips the canonical schedule ETag format', () => {
    expect(scheduleEtag(ID, 7)).toBe(`"schedule:${ID}:v7"`);
    const parsed = parseScheduleIfMatch(scheduleEtag(ID, 7));
    expect(parsed).toEqual({ scheduleId: ID, revision: 7 });
  });

  it('throws 428 SCHEDULE_VERSION_REQUIRED when If-Match is missing', () => {
    expect(() => parseScheduleIfMatch(undefined)).toThrow(ScheduleVersionRequiredException);
    try {
      parseScheduleIfMatch(undefined);
      throw new Error('expected throw');
    } catch (error) {
      const exception = error as ScheduleVersionRequiredException;
      expect(exception.getStatus()).toBe(HttpStatus.PRECONDITION_REQUIRED);
      expect(exception.getResponse()).toMatchObject({ code: 'SCHEDULE_VERSION_REQUIRED' });
    }
  });

  it('throws 412 for malformed/computed values rather than leaking format details', () => {
    const bad = ['schedule:abc:v1', '"schedule:abc:v1"', '"schedule:00000000-0000-4000-8000-000000000001"', 'junk'];
    for (const raw of bad) {
      expect(() => parseScheduleIfMatch(raw)).toThrow(ScheduleVersionMismatchException);
    }
    try {
      parseScheduleIfMatch(bad[0]);
      throw new Error('expected throw');
    } catch (error) {
      expect((error as ScheduleVersionMismatchException).getStatus()).toBe(412);
      expect((error as ScheduleVersionMismatchException).getResponse()).toMatchObject({
        code: 'SCHEDULE_VERSION_MISMATCH',
      });
    }
  });

  it('throws 412 when the header binds a different resource', () => {
    const other = '11111111-1111-4111-8111-111111111111';
    const token = parseScheduleIfMatch(`"schedule:${other}:v1"`);
    expect(() => assertScheduleIfMatchResource(token, ID)).toThrow(ScheduleVersionMismatchException);
  });

  it('accepts upper case ids and the same revision', () => {
    const token = parseScheduleIfMatch(`"schedule:${ID.toUpperCase()}:v2"`);
    expect(assertScheduleIfMatchResource(token, ID).revision).toBe(2);
  });

  it('exposes the If-Match header name without guessing at the transport', () => {
    expect(IF_MATCH_HEADER).toBe('if-match');
  });
});
