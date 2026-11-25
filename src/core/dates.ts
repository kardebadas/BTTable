/** Calendar and clock fields read from a date string; `zone` is minutes east of UTC, if given. */
type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  zone?: number;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;
const US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*([ap]m)?)?(?:\s.*)?$/i;

/** Minutes east of UTC for `Z`, `+hh`, `+hh:mm` or `-hhmm`. */
function zoneMinutes(zone: string): number {
  if (zone.toUpperCase() === 'Z') return 0;
  const digits = zone.slice(1).replace(':', '');
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
  return zone.startsWith('-') ? -minutes : minutes;
}

function matchIso(text: string): DateParts | null {
  const m = ISO.exec(text);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? 0),
    minute: Number(m[5] ?? 0),
    second: Number(m[6] ?? 0),
    ms: Number((m[7] ?? '0').padEnd(3, '0')),
    zone: m[8] === undefined ? undefined : zoneMinutes(m[8]),
  };
}

/** Converts a 12-hour clock hour to 24-hour, or -1 when it is not 1–12. */
function to24Hour(hour: number, meridiem: string): number {
  if (hour < 1 || hour > 12) return -1;
  const isPm = meridiem.toLowerCase() === 'pm';
  return (hour % 12) + (isPm ? 12 : 0);
}

function matchUs(text: string): DateParts | null {
  const m = US.exec(text);
  if (!m) return null;
  const hour = Number(m[4] ?? 0);
  return {
    year: Number(m[3]),
    month: Number(m[1]),
    day: Number(m[2]),
    hour: m[8] ? to24Hour(hour, m[8]) : hour,
    minute: Number(m[5] ?? 0),
    second: Number(m[6] ?? 0),
    ms: Number((m[7] ?? '0').padEnd(3, '0')),
  };
}

function isValidCalendarDay({ year, month, day }: DateParts): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function isValidClock({ hour, minute, second }: DateParts): boolean {
  return hour >= 0 && hour <= 23 && minute <= 59 && second <= 59;
}

function toDate(parts: DateParts): Date | null {
  if (!isValidCalendarDay(parts) || !isValidClock(parts)) return null;
  const { year, month, day, hour, minute, second, ms, zone } = parts;
  if (zone === undefined) return new Date(year, month - 1, day, hour, minute, second, ms);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - zone * 60_000);
}

/**
 * Parses a `Date`, an ISO `yyyy-mm-dd[Thh:mm[:ss[.sss]][zone]]` string or a US
 * `M/D/YYYY[ h:mm[:ss[.sss]] [AM|PM] …]` string, with calendar validation. Strings without a
 * zone are local time. Returns `null` for anything else. The one date parser used by
 * sorting, filtering and search.
 */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const parts = matchIso(text) ?? matchUs(text);
  return parts ? toDate(parts) : null;
}

/** An ordered number identifying the local calendar day of `date` (yyyymmdd). */
export function dayKey(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** The local calendar day of `date` as `M/D/YYYY`. */
export function formatUsDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/** The local calendar day of `date` as ISO `yyyy-mm-dd`. */
export function formatIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
