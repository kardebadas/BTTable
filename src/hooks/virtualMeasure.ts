import { type RefObject, useRef } from 'react';
import { HeightTree } from '../core/heightTree';
import { indexOfId, type RowEntry, type RowId } from './rowModel';
import { useBrowserLayoutEffect } from './useBrowserLayoutEffect';
import { applyPending, type Heights, type Live, placeView, type Shared, spaceOf } from './virtualScroll';

/** A row list's height tree, and the cached heights of the rows still in the list. */
export type BuiltTree = { tree: HeightTree; kept: Heights };

/**
 * Builds the height tree of a row list: each row's cached height, else the estimate. One
 * pass per new list or estimate; it also collects the cached heights still in use.
 */
export function buildTree<R>(entries: readonly RowEntry<R>[], cache: Heights, estimate: number): BuiltTree {
  const heights = new Float64Array(entries.length);
  const kept: Heights = new Map();
  for (let i = 0; i < entries.length; i += 1) {
    const id = entries[i].id;
    const height = cache.get(id);
    heights[i] = height ?? estimate;
    if (height !== undefined) kept.set(id, height);
  }
  return { tree: new HeightTree(heights), kept };
}

/** Drops cached heights of rows no longer in the list (the ones `buildTree` did not keep), so the cache stays the size of the data. */
export function pruneHeights(cache: Heights, kept: Heights): void {
  if (kept.size === cache.size) return;
  cache.clear();
  kept.forEach((height, id) => cache.set(id, height));
}

/** The detail row (`tr.btt-detail-row`) right after a data row, if any. */
export function detailRowOf(row: Element): Element | null {
  const next = row.nextElementSibling;
  return next?.classList.contains('btt-detail-row') ? next : null;
}

/** A row's measured unit: the data row plus its detail row, so both move as one. */
function unitHeight(row: Element): number {
  const detail = detailRowOf(row);
  return row.getBoundingClientRect().height + (detail ? detail.getBoundingClientRect().height : 0);
}

/** Measures the units of the given elements that are mounted rows (or their detail rows) of the last commit: index → height. */
function measure<R>(live: Live<R>, elements: Iterable<Element>): Map<number, number> {
  const measured = new Map<number, number>();
  for (const element of elements) {
    const index = live.ids.get(element);
    if (index === undefined) continue;
    const row = element.classList.contains('btt-detail-row') ? element.previousElementSibling : element;
    if (row) measured.set(index, unitHeight(row));
  }
  return measured;
}

/** Writes measured heights into the cache and the tree; true when any changed. Zero heights (hidden rows) are ignored. */
function storeHeights<R>(cache: Heights, live: Live<R>, measured: Map<number, number>): boolean {
  let changed = false;
  measured.forEach((height, index) => {
    if (height <= 0) return;
    cache.set(live.entries[index].id, height);
    if (live.tree.set(index, height) !== 0) changed = true;
  });
  return changed;
}

/**
 * Forgets the heights of rows whose detail row opened or closed, so an unmounted one falls
 * back to the estimate instead of a stale height. True when any was cached.
 */
function resetHeights<R>(cache: Heights, live: Live<R>, toggled: readonly RowId[]): boolean {
  let reset = false;
  for (const id of toggled) {
    if (!cache.delete(id)) continue;
    reset = true;
    const index = indexOfId(live.entries, id);
    if (index >= 0) live.tree.set(index, live.estimate);
  }
  return reset;
}

/** What changed: elements to measure, rows whose detail row toggled, or `force` to re-place the view anyway. */
export type Measurement = { elements: Iterable<Element>; toggled?: readonly RowId[]; force?: boolean };

/**
 * Stores new row heights and keeps the first visible row where it is on screen (or the
 * bottom in view when the view is at the bottom). Each change costs O(log n).
 */
export function applyMeasurements<R>(shared: Shared<R>, { elements, toggled = [], force = false }: Measurement): void {
  const scroller = shared.scrollRef.current;
  if (!scroller) return;
  shared.setters.setViewport(scroller.clientHeight);
  const live = shared.live.current;
  const { tree, pos } = live;
  const rendered = spaceOf(live, tree.total);
  const anchor = tree.rowAt(pos.top);
  const anchorTop = tree.offset(anchor);
  // A detail row the user opened or closed grows or shrinks the view around that row: keep it in place, not the bottom.
  if (toggled.length > 0) live.pinned = false;
  const reset = resetHeights(shared.cache, live, toggled);
  const stored = storeHeights(shared.cache, live, measure(live, elements));
  if (!stored && !reset && !force) return;
  placeView(shared, scroller, { top: pos.top + tree.offset(anchor) - anchorTop, rendered });
}

/** The ids in exactly one of the two lists: rows whose detail row opened or closed. */
function toggledIds(before: readonly RowId[], after: readonly RowId[]): RowId[] {
  const kept = new Set(before);
  return after.filter((id) => !kept.delete(id)).concat([...kept]);
}

/** Input of `useMeasureAfterCommit`: what the commit rendered. */
export type CommitInput<R> = {
  enabled: boolean;
  expandedIds: readonly RowId[];
  entries: readonly RowEntry<R>[];
  estimate: number;
  tree: HeightTree;
  /** Index in `entries` of the first mounted row. */
  start: number;
  observer: RefObject<ResizeObserver | null>;
};

function mountedRows(scroller: HTMLElement): HTMLElement[] {
  return Array.from(scroller.querySelectorAll<HTMLElement>(':scope > table > tbody > tr.btt-row'));
}

type Commit<R> = Pick<CommitInput<R>, 'entries' | 'estimate' | 'tree' | 'start'> & { rows: HTMLElement[] };

/** Points `live` at the committed list and maps each mounted row element, and its detail row, to its index. */
function recordCommit<R>(live: Live<R>, commit: Commit<R>): void {
  live.entries = commit.entries;
  live.estimate = commit.estimate;
  live.tree = commit.tree;
  live.ids = new WeakMap();
  commit.rows.forEach((row, i) => {
    const index = commit.start + i;
    if (index >= commit.entries.length) return;
    live.ids.set(row, index);
    const detail = detailRowOf(row);
    if (detail) live.ids.set(detail, index);
  });
}

/** (Re)observes the scroller, the mounted rows and their detail rows. */
function observeRows(observer: ResizeObserver | null, scroller: HTMLElement, rows: HTMLElement[]): void {
  if (!observer) return;
  observer.disconnect();
  observer.observe(scroller);
  rows.forEach((row) => {
    observer.observe(row);
    const detail = detailRowOf(row);
    if (detail) observer.observe(detail);
  });
}

/**
 * After every commit: maps the mounted rows to their indexes, (re)observes them and their
 * detail rows, and measures them at once, so newly mounted rows replace their estimate before the browser paints.
 */
export function useMeasureAfterCommit<R>({ enabled, observer, expandedIds, ...commit }: CommitInput<R>, shared: Shared<R>): void {
  const expandedBefore = useRef(expandedIds);
  useBrowserLayoutEffect(() => {
    const scroller = shared.scrollRef.current;
    const toggled = toggledIds(expandedBefore.current, expandedIds);
    expandedBefore.current = expandedIds;
    if (!enabled || !scroller) {
      toggled.forEach((id) => shared.cache.delete(id));
      return;
    }
    const rows = mountedRows(scroller);
    const live = shared.live.current;
    recordCommit(live, { ...commit, rows });
    applyPending(live, scroller);
    observeRows(observer.current, scroller, rows);
    applyMeasurements(shared, { elements: rows, toggled });
  });
}
