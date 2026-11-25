import { parseDate } from './dates';
import { formatValue, toNumber } from './values';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Kind rank (numbers, then dates, then text) and the key compared within that kind. */
type SortKey = { rank: 0 | 1 | 2; num: number; text: string };

/** null, undefined, blank strings, NaN and invalid dates sort as missing. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return Number.isNaN(value);
  return value instanceof Date && Number.isNaN(value.getTime());
}

/** Classifies a present value as a number (incl. booleans, numeric strings), a date, or text. */
function sortKey(value: unknown): SortKey {
  if (typeof value === 'number') return { rank: 0, num: value, text: '' };
  if (typeof value === 'boolean') return { rank: 0, num: Number(value), text: '' };
  const num = toNumber(value);
  if (num !== null) return { rank: 0, num, text: '' };
  const date = parseDate(value);
  if (date) return { rank: 1, num: date.getTime(), text: '' };
  return { rank: 2, num: 0, text: formatValue(value) };
}

/** Total order: by kind rank first, then numerically or by collator within a kind. */
function comparePresent(a: unknown, b: unknown): number {
  const keyA = sortKey(a);
  const keyB = sortKey(b);
  if (keyA.rank !== keyB.rank) return keyA.rank - keyB.rank;
  if (keyA.rank === 2) return collator.compare(keyA.text, keyB.text);
  return Math.sign(keyA.num - keyB.num);
}

/**
 * Sort comparator for raw cell values. Blanks go last in both directions. Other values
 * are ranked by kind — numbers (numbers, booleans, numeric strings), then dates (Date
 * objects and date strings), then text — so mixed columns still sort consistently.
 * Within a kind: numerically, by time, or with a numeric, case- and accent-insensitive
 * collator. Use with the stable `Array.prototype.sort`.
 */
export function compareValues(a: unknown, b: unknown, direction: 'asc' | 'desc' = 'asc'): number {
  const blankA = isBlank(a);
  const blankB = isBlank(b);
  if (blankA || blankB) return Number(blankA) - Number(blankB);
  const result = comparePresent(a, b);
  if (direction === 'asc' || result === 0) return result;
  return -result;
}
