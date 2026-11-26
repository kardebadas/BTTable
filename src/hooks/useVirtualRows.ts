import { type RefObject, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { anchoredScrollTop, rowOffsets, type VirtualWindow, virtualWindow } from '../core/virtual';
import type { RowEntry, RowId } from './rowModel';
import { useBrowserLayoutEffect } from './useBrowserLayoutEffect';

/** Rows mounted beyond each edge of the viewport. */
export const OVERSCAN = 8;

/** Input of `useVirtualRows`. */
export type UseVirtualRowsInput<R> = {
  entries: readonly RowEntry<R>[];
  /** Identity of the view (page, sort, search, filters, resets): a change scrolls back to the top. */
  viewKey: string;
  enabled: boolean;
  /** Height in px assumed for a row until it has been measured. */
  estimatedRowHeight: number;
  /** The scroll container; its `table > tbody > tr.btt-row` children are the mounted rows. */
  scrollRef: RefObject<HTMLElement | null>;
};

/** Measured row heights by row id. Mutated in place: it is the one source of truth. */
type Heights = Map<RowId, number>;

/** What the observer callback and effects read: the latest committed rows and their offsets. */
type Live<R> = {
  entries: readonly RowEntry<R>[];
  estimate: number;
  /** Offsets of `entries` from the current cache; what the next measurement compares against. */
  offsets: number[];
  /** Mounted row element → its row id, rebuilt after each commit. */
  ids: WeakMap<Element, RowId>;
};

/** Offsets computed for one list and estimate, handed from a measurement to the render. */
type Layout<R> = { entries: readonly RowEntry<R>[]; estimate: number; offsets: number[] };

type Setters<R> = {
  setLayout: (layout: Layout<R>) => void;
  setScrollTop: (top: number) => void;
  setViewport: (height: number) => void;
};

type Shared<R> = { live: RefObject<Live<R>>; cache: Heights; scrollRef: RefObject<HTMLElement | null>; setters: Setters<R> };

const NO_OFFSETS = [0];

function offsetsOf<R>(entries: readonly RowEntry<R>[], heights: Heights, estimate: number): number[] {
  return rowOffsets(entries.map((entry) => heights.get(entry.id) ?? estimate));
}

/** Writes the measured heights into the cache; true when any changed. Zero heights (hidden rows) are ignored. */
function storeHeights(cache: Heights, measured: readonly [RowId, number][]): boolean {
  let changed = false;
  for (const [id, height] of measured) {
    if (height <= 0 || cache.get(id) === height) continue;
    cache.set(id, height);
    changed = true;
  }
  return changed;
}

/** Measures the given elements that are mounted rows of the last commit; others are skipped. */
function measure<R>(live: Live<R>, elements: Iterable<Element>): [RowId, number][] {
  const measured: [RowId, number][] = [];
  for (const element of elements) {
    const id = live.ids.get(element);
    if (id !== undefined) measured.push([id, element.getBoundingClientRect().height]);
  }
  return measured;
}

/**
 * Stores new row heights and moves the scroll position by the height change above the
 * first visible row, so what the user is looking at stays put. One offsets pass, handed to
 * the render, when anything changed.
 */
function applyMeasurements<R>({ live, cache, scrollRef, setters }: Shared<R>, elements: Iterable<Element>): void {
  const scroller = scrollRef.current;
  if (!scroller) return;
  setters.setViewport(scroller.clientHeight);
  const current = live.current;
  if (!storeHeights(cache, measure(current, elements))) return;
  const after = offsetsOf(current.entries, cache, current.estimate);
  const top = anchoredScrollTop({ before: current.offsets, after, scrollTop: scroller.scrollTop });
  if (top !== scroller.scrollTop) scroller.scrollTop = top;
  current.offsets = after;
  setters.setLayout({ entries: current.entries, estimate: current.estimate, offsets: after });
  setters.setScrollTop(scroller.scrollTop);
}

/** Drops cached heights of rows no longer in `entries`, so the cache stays the size of the data. */
function pruneHeights<R>(cache: Heights, entries: readonly RowEntry<R>[]): void {
  const present = new Set(entries.map((entry) => entry.id));
  for (const id of cache.keys()) {
    if (!present.has(id)) cache.delete(id);
  }
}

/** The one `ResizeObserver`, when the platform has one: size changes of mounted rows and of the viewport. */
function useResizeObserver<R>(enabled: boolean, shared: Shared<R>): RefObject<ResizeObserver | null> {
  const observer = useRef<ResizeObserver | null>(null);
  useBrowserLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return;
    const resizeObserver = new ResizeObserver((records) => applyMeasurements(shared, records.map((record) => record.target)));
    observer.current = resizeObserver;
    return () => {
      resizeObserver.disconnect();
      observer.current = null;
    };
  }, [enabled, shared]);
  return observer;
}

type CommitInput<R> = {
  enabled: boolean;
  entries: readonly RowEntry<R>[];
  estimate: number;
  /** The offsets this commit rendered. */
  offsets: number[];
  /** Index in `entries` of the first mounted row. */
  start: number;
  observer: RefObject<ResizeObserver | null>;
};

function mountedRows(scroller: HTMLElement): HTMLElement[] {
  return Array.from(scroller.querySelectorAll<HTMLElement>(':scope > table > tbody > tr.btt-row'));
}

type Commit<R> = Pick<CommitInput<R>, 'entries' | 'estimate' | 'offsets' | 'start'> & { rows: HTMLElement[] };

/**
 * Points `live` at the committed entries and maps each mounted row element to its row id.
 * The rendered offsets are taken only for a new list or estimate: otherwise `live.offsets`,
 * kept current by every measurement, is never older than what a render saw.
 */
function recordCommit<R>(live: Live<R>, commit: Commit<R>): void {
  if (live.entries !== commit.entries || live.estimate !== commit.estimate) live.offsets = commit.offsets;
  live.entries = commit.entries;
  live.estimate = commit.estimate;
  live.ids = new WeakMap();
  commit.rows.forEach((row, i) => {
    const entry = commit.entries[commit.start + i];
    if (entry) live.ids.set(row, entry.id);
  });
}

/**
 * After every commit: maps the mounted rows to their ids, (re)observes them, and measures
 * them at once, so newly mounted rows replace their estimate before the browser paints.
 */
function useMeasureAfterCommit<R>({ enabled, observer, ...commit }: CommitInput<R>, shared: Shared<R>): void {
  useBrowserLayoutEffect(() => {
    const scroller = shared.scrollRef.current;
    if (!enabled || !scroller) return;
    const rows = mountedRows(scroller);
    recordCommit(shared.live.current, { ...commit, rows });
    observer.current?.disconnect();
    observer.current?.observe(scroller);
    rows.forEach((row) => observer.current?.observe(row));
    applyMeasurements(shared, rows);
  });
}

/** Tracks the scroll position: passive listener, at most one update per animation frame, rendered before that frame paints. */
function useScrollTracking(enabled: boolean, scrollRef: RefObject<HTMLElement | null>, setScrollTop: (top: number) => void): void {
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!enabled || !scroller) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        flushSync(() => setScrollTop(scroller.scrollTop));
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [enabled, scrollRef, setScrollTop]);
}

function scrollToTop<R>({ scrollRef, setters }: Shared<R>): void {
  if (scrollRef.current) scrollRef.current.scrollTop = 0;
  setters.setScrollTop(0);
}

/**
 * A new list forgets the heights of rows that left it; a new view (page, sort, search,
 * filters, reset) also scrolls back to the top. New data for the same view (polling, a
 * refresh) keeps the reader's place.
 */
function useListChange<R>(entries: readonly RowEntry<R>[], viewKey: string, shared: Shared<R>): void {
  const previous = useRef({ entries, viewKey });
  useBrowserLayoutEffect(() => {
    const last = previous.current;
    previous.current = { entries, viewKey };
    if (last.entries !== entries) pruneHeights(shared.cache, entries);
    if (last.viewKey !== viewKey) scrollToTop(shared);
  }, [entries, viewKey, shared]);
}

/** The offsets to render: the last measurement's when it was for this list and estimate, else one fresh pass. */
function useOffsets<R>(input: { enabled: boolean; entries: readonly RowEntry<R>[]; estimate: number; layout: Layout<R>; cache: Heights }): number[] {
  const { enabled, entries, estimate, layout, cache } = input;
  return useMemo(() => {
    if (!enabled) return NO_OFFSETS;
    if (layout.entries === entries && layout.estimate === estimate) return layout.offsets;
    return offsetsOf(entries, cache, estimate);
  }, [enabled, entries, estimate, layout, cache]);
}

/**
 * Scrolls to `top` and always renders again, even when the scroll state already holds
 * `top` (a reset to 0 in the same commit makes the rendered window stale without changing it).
 */
function useJumpTo(scrollRef: RefObject<HTMLElement | null>, setScrollTop: (top: number) => void): (top: number) => void {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  return useCallback(
    (top: number) => {
      if (scrollRef.current) scrollRef.current.scrollTop = top;
      setScrollTop(top);
      rerender();
    },
    [scrollRef, setScrollTop],
  );
}

/** What `useVirtualRows` returns. */
export type VirtualRows = {
  /** The entries to mount and the spacer heights around them. */
  range: VirtualWindow;
  /** Top offset of each entry (and the total height last), from measured or estimated heights. */
  offsets: number[];
  /** Scrolls to `top` px and renders the window there in the next commit (always a new commit). */
  jumpTo: (top: number) => void;
};

/**
 * Row virtualization for the scroll container in `scrollRef`: which entries to mount and
 * the spacer heights around them, plus their offsets. Row heights are measured (one `ResizeObserver`, cached by
 * row id) and stand in for `estimatedRowHeight` once known; the first visible row stays put
 * when heights above it change; the scroll position resets to the top when `viewKey`
 * changes. When `enabled` is false every entry is mounted, with no spacers.
 */
export function useVirtualRows<R>({ entries, viewKey, enabled, estimatedRowHeight, scrollRef }: UseVirtualRowsInput<R>): VirtualRows {
  const [cache] = useState<Heights>(() => new Map());
  const [layout, setLayout] = useState<Layout<R>>({ entries: [], estimate: estimatedRowHeight, offsets: NO_OFFSETS });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewport] = useState(0);
  const live = useRef<Live<R>>({ entries: [], estimate: estimatedRowHeight, offsets: NO_OFFSETS, ids: new WeakMap() });
  const shared = useMemo(
    () => ({ live, cache, scrollRef, setters: { setLayout, setScrollTop, setViewport } }),
    [cache, scrollRef],
  );
  const offsets = useOffsets({ enabled, entries, estimate: estimatedRowHeight, layout, cache });
  const window = enabled
    ? virtualWindow({ offsets, scrollTop, viewportHeight, overscan: OVERSCAN })
    : { start: 0, end: entries.length, padTop: 0, padBottom: 0 };

  useListChange(entries, viewKey, shared);
  useScrollTracking(enabled, scrollRef, setScrollTop);
  const observer = useResizeObserver(enabled, shared);
  const commit = { enabled, entries, estimate: estimatedRowHeight, offsets, start: window.start, observer };
  useMeasureAfterCommit(commit, shared);
  const jumpTo = useJumpTo(scrollRef, setScrollTop);
  return { range: window, offsets, jumpTo };
}
