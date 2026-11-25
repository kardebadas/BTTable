import { dayKey, parseDate } from './dates';
import { matchesSearch } from './search';
import type { Column, FilterSpec, FilterState, FilterValue, NumberOp, TextOp } from './types';
import { formatValue, getColumnValue, toNumber } from './values';

type ToKey = (value: unknown) => number | null;
type Comparison = Exclude<NumberOp, 'range'>;

const COMPARE: Record<Comparison, (a: number, b: number) => boolean> = {
  eq: (a, b) => a === b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
};
const DATE_TO_NUMBER_OP = { on: 'eq', before: 'lt', after: 'gt', range: 'range' } as const;

/** The calendar-day key of a date value; `null` when it is not a date. */
function toDayKey(value: unknown): number | null {
  const date = parseDate(value);
  return date ? dayKey(date) : null;
}

function isRangeActive(value: FilterValue, toKey: ToKey): boolean {
  return Array.isArray(value) && (toKey(value[0]) !== null || toKey(value[1]) !== null);
}

function isKeyFilterActive(op: string | undefined, value: FilterValue, toKey: ToKey): boolean {
  return op === 'range' ? isRangeActive(value, toKey) : toKey(value) !== null;
}

/**
 * Whether a filter value narrows the rows. Empty values are inactive: '' or blank text,
 * non-numeric numbers, invalid dates, all-empty ranges, `[]`, and `false` for `notEmpty`.
 * `0` is an active value.
 */
export function isFilterActive(spec: FilterSpec, value: FilterValue): boolean {
  switch (spec.type) {
    case 'text':
    case 'select':
      return typeof value === 'string' && value.trim() !== '';
    case 'number':
      return isKeyFilterActive(spec.op, value, toNumber);
    case 'date':
      return isKeyFilterActive(spec.op, value, toDayKey);
    case 'multiselect':
      return Array.isArray(value) && value.length > 0;
    case 'notEmpty':
      return value === true;
  }
}

function matchText(op: TextOp, rowValue: unknown, value: string): boolean {
  const haystack = formatValue(rowValue).trim().toLowerCase();
  const needle = value.trim().toLowerCase();
  if (op === 'equals') return haystack === needle;
  if (op === 'startsWith') return haystack.startsWith(needle);
  if (op === 'endsWith') return haystack.endsWith(needle);
  return haystack.includes(needle);
}

/** Compares a row key against a single target or an inclusive, open-ended range. */
function matchKey(op: NumberOp, key: number | null, value: FilterValue, toKey: ToKey): boolean {
  if (key === null) return false;
  if (op !== 'range') return COMPARE[op](key, toKey(value) as number);
  const [low, high] = value as readonly unknown[];
  const min = toKey(low);
  const max = toKey(high);
  return (min === null || key >= min) && (max === null || key <= max);
}

/** Row values as option-value strings; arrays contribute each element. */
function rowTokens(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(rowTokens);
  return [String(value)];
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return Array.isArray(value) && value.length === 0;
}

function matchActive(spec: FilterSpec, rowValue: unknown, value: FilterValue): boolean {
  switch (spec.type) {
    case 'text':
      return matchText(spec.op ?? 'contains', rowValue, value as string);
    case 'number':
      return matchKey(spec.op ?? 'eq', toNumber(rowValue), value, toNumber);
    case 'date':
      return matchKey(DATE_TO_NUMBER_OP[spec.op ?? 'on'], toDayKey(rowValue), value, toDayKey);
    case 'select':
      return rowTokens(rowValue).includes(value as string);
    case 'multiselect':
      return rowTokens(rowValue).some((token) => (value as readonly string[]).includes(token));
    case 'notEmpty':
      return !isEmptyValue(rowValue);
  }
}

/**
 * Client predicate for one column filter. Null-safe and falsy-correct: an inactive
 * filter matches every row; `0` and `false` are values. Text is case-insensitive and
 * trimmed, numbers compare numerically, dates as calendar days, ranges are inclusive
 * with optional ends, and `select`/`multiselect` match option values exactly (any
 * element of an array value counts).
 */
export function matchesFilter(spec: FilterSpec, rowValue: unknown, value: FilterValue): boolean {
  if (!isFilterActive(spec, value)) return true;
  return matchActive(spec, rowValue, value);
}

/** Input of `filterRows`. */
export type FilterRowsInput<R> = {
  rows: readonly R[];
  columns: readonly Column<R>[];
  search: string;
  filters: FilterState;
};

/**
 * Rows that match the global search and every active column filter, in input order.
 * One linear pass: active filters are resolved once, not per row.
 */
export function filterRows<R>({ rows, columns, search, filters }: FilterRowsInput<R>): R[] {
  const active = columns.filter((column) => column.filter && isFilterActive(column.filter, filters[column.key]));
  const matchesFilters = (row: R) =>
    active.every((column) => matchActive(column.filter as FilterSpec, getColumnValue(column, row), filters[column.key]));
  return rows.filter((row) => matchesSearch(row, columns, search) && matchesFilters(row));
}
