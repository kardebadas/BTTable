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

/** The rows of `ids` the table knows, in order: the rows on screen first, then rows seen before. */
export type RowsOf<R> = (ids: readonly RowId[]) => R[];

/** The id → row map of `entries`, built on first call only: an empty selection never needs it. */
function lazyKnown<R>(entries: readonly RowEntry<R>[]): () => RowCache<R> {
  let known: RowCache<R> | null = null;
  return () => {
    known ??= new Map(entries.map((entry) => [entry.id, entry.row]));
    return known;
  };
}

/** `cache` without the rows of ids no longer selected; the same map when nothing is dropped. */
function pruneCache<R>(cache: RowCache<R>, selected: readonly RowId[]): RowCache<R> {
  if (cache.size === 0) return cache;
  const keep = new Set(selected);
  const pruned = new Map([...cache].filter(([id]) => keep.has(id)));
  return pruned.size === cache.size ? cache : pruned;
}

/** The ids of `selected` that were already selected in `before`. */
function stillSelected(selected: readonly RowId[], before: readonly RowId[]): readonly RowId[] {
  if (selected === before) return selected;
  const was = new Set(before);
  return selected.filter((id) => was.has(id));
}

type Cached<R> = { selected: readonly RowId[]; known: () => RowCache<R>; cache: RowCache<R> };

/**
 * The cache after a change: on a selection change, the old one without unselected ids; when
 * the rows on screen change, the rows of ids selected before and after, from the old
 * screen or the old cache.
 */
function nextCache<R>(cached: Cached<R>, selected: readonly RowId[], known: () => RowCache<R>): RowCache<R> {
  if (cached.known === known) return pruneCache(cached.cache, selected);
  if (selected.length === 0 || cached.selected.length === 0) return new Map();
  return resolveRows(stillSelected(selected, cached.selected), cached.known(), cached.cache);
}

/** `RowsOf` over the rows on screen, then the cache; one pass over the ids. */
function rowsOf<R>(known: () => RowCache<R>, cache: RowCache<R>): RowsOf<R> {
  return (ids) => {
    const rows: R[] = [];
    if (ids.length === 0) return rows;
    const onScreen = known();
    for (const id of ids) {
      if (onScreen.has(id)) rows.push(onScreen.get(id) as R);
      else if (cache.has(id)) rows.push(cache.get(id) as R);
    }
    return rows;
  };
}

/**
 * The selected row objects the table knows, as a lookup over ids. `entries` are the rows
 * it can see now (client: every row; server and manual: the page on screen); a selected row
 * stays known after its page leaves the screen, until it is unselected. Rows seen before
 * are cached when `entries` change, for ids selected then, so a selection change makes no
 * pass over the rows, and an empty selection never maps them. Adjusted during render.
 */
export function useSelectedRows<R>(selected: readonly RowId[], entries: readonly RowEntry<R>[]): RowsOf<R> {
  const known = useMemo(() => lazyKnown(entries), [entries]);
  const [cached, setCached] = useState<Cached<R>>(() => ({ selected, known, cache: new Map() }));
  let cache = cached.cache;
  if (cached.selected !== selected || cached.known !== known) {
    cache = nextCache(cached, selected, known);
    setCached({ selected, known, cache });
  }
  return useMemo(() => rowsOf(known, cache), [known, cache]);
}
