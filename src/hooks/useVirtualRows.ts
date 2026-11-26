import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';
import { HeightTree, type Offsets } from '../core/heightTree';
import { type ScrollPos, scrollSpace } from '../core/scrollMap';
import { type VirtualWindow, virtualWindow } from '../core/virtual';
import type { RowEntry, RowId } from './rowModel';
import { useBrowserLayoutEffect } from './useBrowserLayoutEffect';
import { applyMeasurements, type BuiltTree, buildTree, pruneHeights, useMeasureAfterCommit } from './virtualMeasure';
import { type Heights, jumpToTop, type Live, type Shared, useEndKey, useScrollbarDrag, useScrollTracking } from './virtualScroll';

export { detailRowOf } from './virtualMeasure';

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
  /** Rows whose detail row is open: a row that opens or closes has a new height to measure. */
  expandedIds?: readonly RowId[];
};

const TOP: ScrollPos = { top: 0, delta: 0 };
const NO_IDS: RowId[] = [];
const NO_ROWS: BuiltTree = { tree: new HeightTree(new Float64Array(0)), kept: new Map() };

/** The one `ResizeObserver`, when the platform has one: size changes of mounted rows and of the viewport. */
function useResizeObserver<R>(enabled: boolean, shared: Shared<R>): RefObject<ResizeObserver | null> {
  const observer = useRef<ResizeObserver | null>(null);
  useBrowserLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return;
    const resizeObserver = new ResizeObserver((records) => applyMeasurements(shared, { elements: records.map((record) => record.target) }));
    observer.current = resizeObserver;
    return () => {
      resizeObserver.disconnect();
      observer.current = null;
    };
  }, [enabled, shared]);
  return observer;
}

function scrollToTop<R>(shared: Shared<R>): void {
  const live = shared.live.current;
  Object.assign(live, { pinned: false, pending: null, pos: TOP, scroll: 0 });
  if (shared.scrollRef.current) shared.scrollRef.current.scrollTop = 0;
  shared.setters.setPos(TOP);
}

/**
 * A new list forgets the heights of rows that left it; a new view (page, sort, search,
 * filters, reset) also scrolls back to the top. New data for the same view (polling, a
 * refresh) keeps the reader's place.
 */
function useListChange<R>(entries: readonly RowEntry<R>[], viewKey: string, kept: Heights, shared: Shared<R>): void {
  const previous = useRef({ entries, viewKey });
  useBrowserLayoutEffect(() => {
    const last = previous.current;
    previous.current = { entries, viewKey };
    if (last.entries !== entries) pruneHeights(shared.cache, kept);
    if (last.viewKey !== viewKey) scrollToTop(shared);
  }, [entries, viewKey, kept, shared]);
}

/** After a thumb drag: places the view again, so one released at the bottom shows the last row. */
function useDragRelease<R>(enabled: boolean, shared: Shared<R>): void {
  const release = useCallback(() => applyMeasurements(shared, { elements: [], force: true }), [shared]);
  useScrollbarDrag(enabled, shared, release);
}

/** What `useVirtualRows` returns. */
export type VirtualRows = {
  /** The entries to mount and the spacer heights around them. */
  range: VirtualWindow;
  /** Content offsets of the entries, from measured or estimated heights. */
  offsets: Offsets;
  /** Scrolls to content offset `top` px and renders the window there in the next commit (always a new commit). */
  jumpTo: (top: number) => void;
};

/** The hook's shared state (live ref, height cache, setters, stable for its life) and the rendered position. */
function useShared<R>(scrollRef: RefObject<HTMLElement | null>, cache: Heights, tree: HeightTree) {
  const [pos, setPos] = useState<ScrollPos>(TOP);
  const [viewportHeight, setViewport] = useState(0);
  const [dragSpace, setDragSpace] = useState<number | null>(null);
  const live = useRef<Live<R>>({ entries: [], estimate: 0, tree, ids: new WeakMap(), pos: TOP, scroll: 0, pinned: false, dragSpace: null, pending: null });
  const shared = useMemo<Shared<R>>(() => ({ live, cache, scrollRef, setters: { setPos, setViewport, setDragSpace } }), [cache, scrollRef]);
  return { shared, pos, viewportHeight, dragSpace };
}

/**
 * Row virtualization for the scroll container in `scrollRef`: which entries to mount and
 * the spacer heights around them, plus their offsets. Row heights are measured (one
 * `ResizeObserver`, cached by row id; a data row and its detail row count as one unit) and
 * stand in for `estimatedRowHeight` once known, in a tree updated in O(log n) per row. The
 * first visible row stays put when heights above it change, the last one while the view is
 * at the bottom; the scroll position resets to the top when `viewKey` changes. Rows taller
 * than the browsers' element height cap get a scaled scroll space (`core/scrollMap`). When
 * `enabled` is false every entry is mounted, with no spacers.
 */
export function useVirtualRows<R>(input: UseVirtualRowsInput<R>): VirtualRows {
  const { entries, viewKey, enabled, estimatedRowHeight: estimate, scrollRef } = input;
  const [cache] = useState<Heights>(() => new Map());
  const built = useMemo(() => (enabled ? buildTree(entries, cache, estimate) : NO_ROWS), [enabled, entries, cache, estimate]);
  const tree = built.tree;
  const { shared, pos, viewportHeight, dragSpace } = useShared<R>(scrollRef, cache, tree);
  const space = dragSpace ?? scrollSpace(tree.total);
  const window = enabled
    ? virtualWindow({ offsets: tree, scrollTop: pos.top, viewportHeight, overscan: OVERSCAN, delta: pos.delta, space })
    : { start: 0, end: entries.length, padTop: 0, padBottom: 0 };

  useListChange(entries, viewKey, built.kept, shared);
  useScrollTracking(enabled, shared);
  useDragRelease(enabled, shared);
  useEndKey(enabled, shared);
  const observer = useResizeObserver(enabled, shared);
  const commit = { enabled, entries, estimate, tree, start: window.start, observer, expandedIds: input.expandedIds ?? NO_IDS };
  useMeasureAfterCommit(commit, shared);
  const jumpTo = useCallback((top: number) => jumpToTop(shared, top), [shared]);
  return { range: window, offsets: tree, jumpTo };
}
