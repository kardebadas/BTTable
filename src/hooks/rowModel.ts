import { compareValues } from '../core/compare';
import { filterRows } from '../core/filters';
import type { Column, FilterState, SortState } from '../core/types';
import { getColumnValue } from '../core/values';

/** A row id, from `getRowId`. */
export type RowId = string | number;

/** A row with its id and its index in the original `rows` prop. */
export type RowEntry<R> = { row: R; id: RowId; index: number };

/**
 * Pairs each row with its id and original index, before any filtering, so the index
 * fallback of `getRowId` stays positional in the caller's array. Null and non-object
 * rows are skipped.
 */
export function buildEntries<R>(rows: readonly R[], getRowId: (row: R, index: number) => RowId): RowEntry<R>[] {
  const entries: RowEntry<R>[] = [];
  rows.forEach((row, index) => {
    if (typeof row === 'object' && row !== null) entries.push({ row, id: getRowId(row, index), index });
  });
  return entries;
}

/** Input of `filterEntries`. */
export type FilterEntriesInput<R> = {
  entries: readonly RowEntry<R>[];
  columns: readonly Column<R>[];
  search: string;
  filters: FilterState;
};

/** The entries whose rows pass the search and every active filter (`filterRows`), in order. */
export function filterEntries<R>({ entries, columns, search, filters }: FilterEntriesInput<R>): RowEntry<R>[] {
  const kept = filterRows({ rows: entries.map((entry) => entry.row), columns, search, filters });
  // filterRows keeps input order, so one forward walk pairs each kept row with its entry.
  const result: RowEntry<R>[] = [];
  let next = 0;
  for (const entry of entries) {
    if (entry.row !== kept[next]) continue;
    result.push(entry);
    next += 1;
  }
  return result;
}

/**
 * Entries stably sorted by the sort column's `sortValue` (default: its value) with
 * `compareValues`. Keys are read once per row, so the pass is O(n log n). An unknown sort
 * key leaves the order unchanged.
 */
export function sortEntries<R>(entries: RowEntry<R>[], columns: readonly Column<R>[], sort: SortState): RowEntry<R>[] {
  const column = sort && columns.find((candidate) => candidate.key === sort.key);
  if (!sort || !column) return entries;
  const read = column.sortValue ?? ((row: R) => getColumnValue(column, row));
  const keyed = entries.map((entry) => ({ entry, key: read(entry.row) }));
  keyed.sort((a, b) => compareValues(a.key, b.key, sort.direction));
  return keyed.map((item) => item.entry);
}
