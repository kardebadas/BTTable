import { describe, expect, it } from 'vitest';
import { dayKey, formatIsoDay, formatUsDate, parseDate, formatMinuteKey, minuteKey } from './dates';

function parts(date: Date | null): number[] | null {
  if (!date) return null;
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  ];
}

describe('parseDate', () => {
  it('returns a valid Date as is and rejects an invalid one', () => {
    const date = new Date(2026, 0, 5);
    expect(parseDate(date)).toBe(date);
    expect(parseDate(new Date('nope'))).toBeNull();
  });

  it('parses ISO dates as local calendar days', () => {
    expect(parts(parseDate('2026-01-05'))).toEqual([2026, 1, 5, 0, 0, 0, 0]);
    expect(parts(parseDate(' 2026-01-05 '))).toEqual([2026, 1, 5, 0, 0, 0, 0]);
  });

  it('parses ISO date-times without a zone as local time', () => {
    expect(parts(parseDate('2026-01-05T13:45'))).toEqual([2026, 1, 5, 13, 45, 0, 0]);
    expect(parts(parseDate('2026-01-05 13:45:30.250'))).toEqual([2026, 1, 5, 13, 45, 30, 250]);
    expect(parts(parseDate('2026-01-05T13:45:30.123456'))).toEqual([2026, 1, 5, 13, 45, 30, 123]);
  });

  it('honours an ISO zone designator', () => {
    expect(parseDate('2026-01-05T10:00:00Z')?.getTime()).toBe(Date.UTC(2026, 0, 5, 10));
    expect(parseDate('2026-01-05T10:00+05:30')?.getTime()).toBe(Date.UTC(2026, 0, 5, 4, 30));
    expect(parseDate('2026-01-05T10:00:00-0800')?.getTime()).toBe(Date.UTC(2026, 0, 5, 18));
  });

  it('accepts an hour-only offset (PostgreSQL timestamptz text)', () => {
    expect(parseDate('2026-01-05 10:30:00+00')?.getTime()).toBe(Date.UTC(2026, 0, 5, 10, 30));
    expect(parseDate('2026-01-05 10:30:00.123456+00')?.getTime()).toBe(Date.UTC(2026, 0, 5, 10, 30, 0, 123));
    expect(parseDate('2026-01-05 10:30:00-03')?.getTime()).toBe(Date.UTC(2026, 0, 5, 13, 30));
  });

  it('parses US M/D/YYYY with an optional time', () => {
    expect(parts(parseDate('1/5/2026'))).toEqual([2026, 1, 5, 0, 0, 0, 0]);
    expect(parts(parseDate('01/05/2026'))).toEqual([2026, 1, 5, 0, 0, 0, 0]);
    expect(parts(parseDate('1/5/2026 1:30 PM'))).toEqual([2026, 1, 5, 13, 30, 0, 0]);
    expect(parts(parseDate('1/5/2026 12:15:07 am'))).toEqual([2026, 1, 5, 0, 15, 7, 0]);
    expect(parts(parseDate('1/5/2026 12:00 PM'))).toEqual([2026, 1, 5, 12, 0, 0, 0]);
    expect(parts(parseDate('1/5/2026 14:00'))).toEqual([2026, 1, 5, 14, 0, 0, 0]);
    expect(parts(parseDate('1/5/2026, 9:05 AM EST'))).toEqual([2026, 1, 5, 9, 5, 0, 0]);
  });

  it('keeps US times with fractional seconds', () => {
    expect(parts(parseDate('1/5/2026 10:30:00.000'))).toEqual([2026, 1, 5, 10, 30, 0, 0]);
    expect(parts(parseDate('1/5/2026 10:30:15.25 PM'))).toEqual([2026, 1, 5, 22, 30, 15, 250]);
  });

  it('validates the calendar and the clock', () => {
    expect(parseDate('2024-02-29')).not.toBeNull();
    for (const bad of [
      '2023-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2/30/2026',
      '13/1/2026',
      '2026-01-05T24:00',
      '2026-01-05T10:60',
      '1/5/2026 13:00 PM',
      '1/5/2026 0:00 AM',
      '1/5/2026 25:00',
    ]) {
      expect(parseDate(bad), bad).toBeNull();
    }
  });

  it('rejects values that are not dates', () => {
    for (const bad of ['', 'hello', '2026-1-5', '5.1.2026', 20260105, null, undefined, {}, true]) {
      expect(parseDate(bad), String(bad)).toBeNull();
    }
  });
});

describe('test time zone', () => {
  it('runs in America/New_York so local-day logic is exercised', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
    expect(new Date(2026, 0, 5).getTimezoneOffset()).toBe(300);
  });

  it('maps late-UTC instants to the New York calendar day', () => {
    expect(formatIsoDay(parseDate('2026-01-05T23:30:00Z') as Date)).toBe('2026-01-05');
    expect(formatIsoDay(parseDate('2026-01-06T03:00:00Z') as Date)).toBe('2026-01-05');
    expect(formatIsoDay(parseDate('2026-01-06T05:00:00Z') as Date)).toBe('2026-01-06');
  });
});

describe('date formatting helpers', () => {
  const date = new Date(2026, 0, 5, 23, 59);

  it('formats US and ISO calendar days in local time', () => {
    expect(formatUsDate(date)).toBe('1/5/2026');
    expect(formatIsoDay(date)).toBe('2026-01-05');
    expect(formatIsoDay(new Date(2026, 10, 25))).toBe('2026-11-25');
  });

  it('gives one ordered key per calendar day, ignoring the time', () => {
    expect(dayKey(date)).toBe(dayKey(new Date(2026, 0, 5)));
    expect(dayKey(new Date(2025, 11, 31))).toBeLessThan(dayKey(new Date(2026, 0, 1)));
  });
});

describe('minuteKey and formatMinuteKey', () => {
  it('keys the local wall-clock minute, dropping seconds', () => {
    expect(minuteKey('2026-01-05T09:07')).toBe(202601050907);
    expect(minuteKey('2026-01-05T09:07:59.999')).toBe(202601050907);
    expect(minuteKey('1/5/2026 9:07 PM')).toBe(202601052107);
    expect(minuteKey(new Date(2026, 0, 5, 9, 7, 30))).toBe(202601050907);
  });

  it('reads zoned strings and Dates on the local (New York) clock', () => {
    expect(minuteKey('2026-01-06T03:15:00Z')).toBe(202601052215);
    expect(minuteKey(new Date(Date.UTC(2026, 6, 1, 12, 0)))).toBe(202607010800);
  });

  it('is null for anything that is not a date', () => {
    for (const value of [null, undefined, '', '  ', 'soon', '2026-02-30T10:00', '2026-01-05T24:00', 42, new Date(Number.NaN)]) {
      expect(minuteKey(value)).toBeNull();
    }
  });

  it('keeps zoneless clock times a DST change skips or repeats as written', () => {
    // 2026-03-08 02:30 does not exist in New York, 2026-11-01 01:30 happens twice.
    expect(minuteKey('2026-03-08T02:30')).toBe(202603080230);
    expect(minuteKey('2026-11-01T01:30')).toBe(202611010130);
    expect(minuteKey('2026-11-01T05:30:00Z')).toBe(202611010130);
    expect(minuteKey('2026-11-01T06:30:00Z')).toBe(202611010130);
  });

  it('orders keys by time and formats them as datetime-local strings', () => {
    expect(minuteKey('2026-01-05T23:59')).toBeLessThan(minuteKey('2026-01-06T00:00') as number);
    expect(formatMinuteKey(202601050907)).toBe('2026-01-05T09:07');
    expect(formatMinuteKey(minuteKey('0999-12-31T23:59') as number)).toBe('0999-12-31T23:59');
  });
});
