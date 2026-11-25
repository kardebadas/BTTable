import { compareValues } from '../core/compare';
import { filterRows } from '../core/filters';
import type { Column, FilterState, SortState } from '../core/types';
import { getColumnValue, ownRowId } from '../core/values';

/** A row id, from `getRowId`. */
export type RowId = string | number;

/** Rows as passed to the table: an array, or an object map whose keys are row id fallbacks. */
export type RowSource<R> = readonly R[] | Readonly<Record<string, R>>;

/** A row with its id and its index in the original `rows` prop (a map: its position). */
export type RowEntry<R> = { row: R; id: RowId; index: number };

/** Number of rows in a source, invalid ones included. */
export function sourceSize(rows: RowSource<unknown>): number {
  return Array.isArray(rows) ? rows.length : Object.keys(rows).length;
}

/**
 * Pairs each row with its id and original index (a map: its position), before any
 * filtering, so the index fallback stays positional in the caller's data. Without
 * `getRowId` the id is the row's own id field, else its map key, else its index. Null and
 * non-object rows are skipped.
 */
export function buildEntries<R>(rows: RowSource<R>, getRowId?: (row: R, index: number) => RowId): RowEntry<R>[] {
  const keys = Array.isArray(rows) ? undefined : Object.keys(rows);
  const values: readonly R[] = keys ? keys.map((key) => (rows as Readonly<Record<string, R>>)[key]) : (rows as readonly R[]);
  const entries: RowEntry<R>[] = [];
  values.forEach((row, index) => {
    if (typeof row !== 'object' || row === null) return;
    const id = getRowId ? getRowId(row, index) : (ownRowId(row) ?? keys?.[index] ?? index);
    entries.push({ row, id, index });
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
