import { dayKey, minuteKey, parseDate } from './dates';
import { matchesSearch } from './search';
import type { Column, FilterSpec, FilterState, FilterType, FilterValue, NumberOp, TextOp } from './types';
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

type DateSpec = Extract<FilterSpec, { type: 'date' | 'datetime' }>;

/** The calendar-day key of a date value; `null` when it is not a date. */
function toDayKey(value: unknown): number | null {
  const date = parseDate(value);
  return date ? dayKey(date) : null;
}

/** The key of each date-like filter: the local calendar day, or the local wall-clock minute. */
const DATE_KEYS: Record<DateSpec['type'], ToKey> = { date: toDayKey, datetime: minuteKey };

/** A date or date-time filter: compares the keys of its type with the operator (default `on`). */
function matchDate(spec: DateSpec, rowValue: unknown, value: FilterValue): boolean {
  const toKey = DATE_KEYS[spec.type];
  return matchKey(DATE_TO_NUMBER_OP[spec.op ?? 'on'], toKey(rowValue), value, toKey);
}

function isRangeActive(value: FilterValue, toKey: ToKey): boolean {
  return Array.isArray(value) && (toKey(value[0]) !== null || toKey(value[1]) !== null);
}

function isKeyFilterActive(op: string | undefined, value: FilterValue, toKey: ToKey): boolean {
  return op === 'range' ? isRangeActive(value, toKey) : toKey(value) !== null;
}

/**
 * Whether a filter value narrows the rows. Empty values are inactive: '' or blank text,
 * non-numeric numbers, invalid dates and date-times, all-empty ranges, `[]`, and `false` for `notEmpty`.
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
    case 'datetime':
      return isKeyFilterActive(spec.op, value, DATE_KEYS[spec.type]);
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
    case 'datetime':
      return matchDate(spec, rowValue, value);
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
 * trimmed, numbers compare numerically, dates as local calendar days, date-times as local
 * wall-clock minutes (`on` = the same minute), ranges are inclusive
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

/** Every accepted spelling of a filter type, lowercased: the v1 names and the legacy ones. */
const FILTER_TYPE_ALIASES = new Map<string, FilterType>([
  ['text', 'text'],
  ['textarea', 'text'],
  ['string', 'text'],
  ['string_text', 'text'],
  ['number', 'number'],
  ['numeric', 'number'],
  ['number_text', 'number'],
  ['date', 'date'],
  ['date_text', 'date'],
  ['datetime', 'datetime'],
  ['date_time', 'datetime'],
  ['datetime-local', 'datetime'],
  ['datetime_text', 'datetime'],
  ['select', 'select'],
  ['string_select', 'select'],
  ['multiselect', 'multiselect'],
  ['multi_select', 'multiselect'],
  ['multi-select', 'multiselect'],
  ['string_multiselect', 'multiselect'],
  ['notempty', 'notEmpty'],
  ['not_empty', 'notEmpty'],
  ['not-empty', 'notEmpty'],
]);

/**
 * The filter type a loose spelling names: trimmed and lowercased, with legacy spellings
 * mapped (`multi_select` and `multi-select` to `multiselect`, `textarea` to `text`, the
 * legacy `dataType_filterType` pairs such as `date_text` to `date`). `null` for anything
 * else, including blank and non-string input: unknown types are never guessed as text.
 */
export function normalizeFilterType(input: unknown): FilterType | null {
  if (typeof input !== 'string') return null;
  return FILTER_TYPE_ALIASES.get(input.trim().toLowerCase()) ?? null;
}
