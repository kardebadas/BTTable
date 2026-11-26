import { useMemo, useState } from 'react';
import type { RowEntry, RowId } from './rowModel';

/** Row objects of selected ids, by id. */
export type RowCache<R> = ReadonlyMap<RowId, R>;

/**
 * The rows of `ids`, by id: from `known` (the rows on screen) first, else from `cache` (rows
 * seen before). Ids with neither are left out, so the result holds selected ids only.
 */
export function resolveRows<R>(ids: readonly RowId[], known: RowCache<R>, cache: RowCache<R>): Map<RowId, R> {
  const rows = new Map<RowId, R>();
  for (const id of ids) {
    if (known.has(id)) rows.set(id, known.get(id) as R);
    else if (cache.has(id)) rows.set(id, cache.get(id) as R);
  }
  return rows;
}

/** The rows of `ids` in selection order. */
export function rowsInOrder<R>(ids: readonly RowId[], rows: RowCache<R>): R[] {
  return ids.filter((id) => rows.has(id)).map((id) => rows.get(id) as R);
}

type Cached<R> = { selected: readonly RowId[]; known: RowCache<R>; rows: RowCache<R> };

/**
 * The selected row objects the table knows. `entries` are the rows it can see now (client:
 * every row; server and manual: the page on screen); a selected row stays known after its
 * page leaves the screen. The cache holds selected ids only: it is rebuilt from the
 * selection on every change, so unselected rows drop out. Adjusted during render.
 */
export function useSelectedRows<R>(selected: readonly RowId[], entries: readonly RowEntry<R>[]) {
  const known = useMemo(() => new Map(entries.map((entry) => [entry.id, entry.row])), [entries]);
  const [cached, setCached] = useState<Cached<R>>(() => ({ selected, known, rows: resolveRows(selected, known, new Map()) }));
  if (cached.selected === selected && cached.known === known) return { known, cache: cached.rows };
  const rows = resolveRows(selected, known, cached.rows);
  setCached({ selected, known, rows });
  return { known, cache: rows };
}
