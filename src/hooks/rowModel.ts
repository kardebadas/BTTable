import { ownRowId } from '../core/values';

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

/** Id → index maps, built on first lookup and kept as long as their list lives. */
const indexMaps = new WeakMap<readonly RowEntry<unknown>[], Map<RowId, number>>();

/**
 * Index of the first entry with `id` in `entries`, or -1. The id → index map is built once
 * per list (O(n)), on the first lookup; every later lookup in that list is O(1).
 */
export function indexOfId<R>(entries: readonly RowEntry<R>[], id: RowId): number {
  let map = indexMaps.get(entries);
  if (!map) {
    map = new Map();
    for (let i = entries.length - 1; i >= 0; i -= 1) map.set(entries[i].id, i);
    indexMaps.set(entries, map);
  }
  return map.get(id) ?? -1;
}
