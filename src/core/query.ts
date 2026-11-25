import { formatIsoDay, parseDate } from './dates';
import { isFilterActive } from './filters';
import type { Column, FilterSpec, FilterState, FilterValue, Query, SortState } from './types';
import { toNumber } from './values';

/** The view state a server query is built from. */
export type QueryState = { search: string; filters: FilterState; sort: SortState; page: number; pageSize: number };

/** A date as an ISO `yyyy-mm-dd` day, or `null` when it is not a date. */
function toIsoDay(value: unknown): string | null {
  const date = parseDate(value);
  return date ? formatIsoDay(date) : null;
}

/** One value, or each end of a range, converted by `convert`. */
function convertValue(value: FilterValue, convert: (value: unknown) => unknown): unknown {
  return Array.isArray(value) ? value.map(convert) : convert(value);
}

/** A filter value as sent to the server: trimmed text, numbers as numbers, dates as ISO days, others unchanged. */
function typedValue(spec: FilterSpec, value: FilterValue): unknown {
  if (spec.type === 'text') return String(value).trim();
  if (spec.type === 'number') return convertValue(value, toNumber);
  if (spec.type === 'date') return convertValue(value, toIsoDay);
  return value;
}

const DEFAULT_OPS: Partial<Record<FilterSpec['type'], string>> = { text: 'contains', number: 'eq', date: 'on' };

/** The operator of a filter: the column's `op`, else the default of its type; none for types without operators. */
function resolvedOp(spec: FilterSpec): string | undefined {
  if ('op' in spec && spec.op !== undefined) return spec.op;
  return DEFAULT_OPS[spec.type];
}

/**
 * The active filters of `columns`, keyed by column key, with their type, resolved operator
 * (text, number and date filters) and typed value.
 */
function activeFilters<R>(columns: readonly Column<R>[], filters: FilterState): Query['filters'] {
  const result: Query['filters'] = {};
  for (const column of columns) {
    const spec = column.filter;
    const value = filters[column.key];
    if (!spec || !isFilterActive(spec, value)) continue;
    const entry: Query['filters'][string] = { type: spec.type, value: typedValue(spec, value) };
    const op = resolvedOp(spec);
    if (op !== undefined) entry.op = op;
    result[column.key] = entry;
  }
  return result;
}

/**
 * The server-mode `Query` for a view state: the search trimmed, only active filters (blank
 * text is inactive), sent as typed values.
 */
export function buildQuery<R>(state: QueryState, columns: readonly Column<R>[]): Query {
  const { page, pageSize, sort } = state;
  return { page, pageSize, search: state.search.trim(), sort, filters: activeFilters(columns, state.filters) };
}

const TYPED = new Set<FilterSpec['type']>(['text', 'number', 'date']);

/** Identity of the typed-in filters (text, number, date) of a query; a change there is debounced. */
export function typedFiltersKey(query: Query): string {
  return JSON.stringify(Object.entries(query.filters).filter(([, filter]) => TYPED.has(filter.type)));
}
