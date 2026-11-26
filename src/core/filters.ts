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

/** A row value normalised for its filter type, computed once per row and value. */
export type FilterKey = string | number | boolean | null | readonly string[];

/** Tests a row's `FilterKey` against one filter value; built once per filter pass. */
export type FilterMatcher = (key: FilterKey) => boolean;

/** Text filter: case-insensitive and trimmed on both sides; the needle is normalised once. */
function textMatcher(op: TextOp, value: string): FilterMatcher {
  const needle = value.trim().toLowerCase();
  if (op === 'equals') return (key) => key === needle;
  if (op === 'startsWith') return (key) => (key as string).startsWith(needle);
  if (op === 'endsWith') return (key) => (key as string).endsWith(needle);
  return (key) => (key as string).includes(needle);
}

/** Compares a row key against a single target or an inclusive, open-ended range, resolved once. */
function keyMatcher(op: NumberOp, value: FilterValue, toKey: ToKey): FilterMatcher {
  if (op !== 'range') {
    const compare = COMPARE[op];
    const target = toKey(value) as number;
    return (key) => key !== null && compare(key as number, target);
  }
  const [low, high] = value as readonly unknown[];
  const min = toKey(low);
  const max = toKey(high);
  return (key) => key !== null && (min === null || (key as number) >= min) && (max === null || (key as number) <= max);
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

/**
 * The part of a row value a filter of this type compares: trimmed lowercase text, a number,
 * a day or minute key, the option tokens, or whether it is filled. It does not depend on the
 * filter value, so it can be computed once per row and reused across filter passes.
 */
export function filterKey(spec: FilterSpec, rowValue: unknown): FilterKey {
  switch (spec.type) {
    case 'text':
      return formatValue(rowValue).trim().toLowerCase();
    case 'number':
      return toNumber(rowValue);
    case 'date':
    case 'datetime':
      return DATE_KEYS[spec.type](rowValue);
    case 'select':
    case 'multiselect':
      return rowTokens(rowValue);
    case 'notEmpty':
      return !isEmptyValue(rowValue);
  }
}

/** The matcher of an active filter for `filterKey` keys; the filter value is resolved here, once. */
export function filterMatcher(spec: FilterSpec, value: FilterValue): FilterMatcher {
  switch (spec.type) {
    case 'text':
      return textMatcher(spec.op ?? 'contains', value as string);
    case 'number':
      return keyMatcher(spec.op ?? 'eq', value, toNumber);
    case 'date':
    case 'datetime':
      return dateMatcher(spec, value);
    case 'select':
    case 'multiselect':
      return optionMatcher(spec.type, value);
    case 'notEmpty':
      return (key) => key === true;
  }
}

/** A date or date-time filter: compares the keys of its type with the operator (default `on`). */
function dateMatcher(spec: DateSpec, value: FilterValue): FilterMatcher {
  return keyMatcher(DATE_TO_NUMBER_OP[spec.op ?? 'on'], value, DATE_KEYS[spec.type]);
}

/** `select` matches the one option value, `multiselect` any of them, against the row's tokens. */
function optionMatcher(type: 'select' | 'multiselect', value: FilterValue): FilterMatcher {
  if (type === 'select') return (key) => (key as readonly string[]).includes(value as string);
  return (key) => (key as readonly string[]).some((token) => (value as readonly string[]).includes(token));
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
  return filterMatcher(spec, value)(filterKey(spec, rowValue));
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
  const active = columns
    .filter((column) => column.filter && isFilterActive(column.filter, filters[column.key]))
    .map((column) => ({ column, spec: column.filter as FilterSpec, matches: filterMatcher(column.filter as FilterSpec, filters[column.key]) }));
  const matchesFilters = (row: R) =>
    active.every(({ column, spec, matches }) => matches(filterKey(spec, getColumnValue(column, row))));
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
