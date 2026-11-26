import { parseDate } from './dates';
import { formatValue, toNumber } from './values';

/** The one collator text sort keys are compared with: numeric, case- and accent-insensitive. */
export const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Blanks rank after every present kind. */
const BLANK_RANK = 3;

/**
 * A value's sort key: kind rank (numbers 0, dates 1, text 2, blank 3) and the key compared
 * within that kind. Build it once per value and compare keys with `compareSortKeys`.
 */
export type SortKey = { readonly rank: 0 | 1 | 2 | 3; readonly num: number; readonly text: string };

const BLANK_KEY: SortKey = { rank: BLANK_RANK, num: 0, text: '' };

/** null, undefined, blank strings, NaN and invalid dates sort as missing. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return Number.isNaN(value);
  return value instanceof Date && Number.isNaN(value.getTime());
}

/** Classifies a value as blank, a number (incl. booleans, numeric strings), a date, or text. */
export function sortKey(value: unknown): SortKey {
  if (isBlank(value)) return BLANK_KEY;
  if (typeof value === 'number') return { rank: 0, num: value, text: '' };
  if (typeof value === 'boolean') return { rank: 0, num: Number(value), text: '' };
  const num = toNumber(value);
  if (num !== null) return { rank: 0, num, text: '' };
  const date = parseDate(value);
  if (date) return { rank: 1, num: date.getTime(), text: '' };
  return { rank: 2, num: 0, text: formatValue(value) };
}

/** Total order of present keys: by kind rank first, then numerically or by collator within a kind. */
function comparePresent(a: SortKey, b: SortKey): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.rank === 2) return textCollator.compare(a.text, b.text);
  return Math.sign(a.num - b.num);
}

/** `compareValues` on prebuilt keys: blanks last in both directions, present keys by kind then value. */
export function compareSortKeys(a: SortKey, b: SortKey, direction: 'asc' | 'desc' = 'asc'): number {
  if (a.rank === BLANK_RANK || b.rank === BLANK_RANK) return Number(a.rank === BLANK_RANK) - Number(b.rank === BLANK_RANK);
  const result = comparePresent(a, b);
  if (direction === 'asc' || result === 0) return result;
  return -result;
}

/**
 * Sort comparator for raw cell values. Blanks go last in both directions. Other values
 * are ranked by kind — numbers (numbers, booleans, numeric strings), then dates (Date
 * objects and date strings), then text — so mixed columns still sort consistently.
 * Within a kind: numerically, by time, or with a numeric, case- and accent-insensitive
 * collator. Use with the stable `Array.prototype.sort`.
 */
export function compareValues(a: unknown, b: unknown, direction: 'asc' | 'desc' = 'asc'): number {
  return compareSortKeys(sortKey(a), sortKey(b), direction);
}
