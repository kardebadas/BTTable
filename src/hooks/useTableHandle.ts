import { type Ref, type RefObject, useImperativeHandle, useRef } from 'react';
import { leadingCount } from '../components/ColGroup';
import type { Column } from '../core/types';
import type { RowEntry, RowId } from './rowModel';
import { useBrowserLayoutEffect } from './useBrowserLayoutEffect';
import { detailRowOf } from './useVirtualRows';

/** Where `scrollToRow` puts the row in the scroll area (below the sticky header). */
export type RowAlign = 'start' | 'center' | 'end' | 'nearest';

/**
 * The imperative handle of `BTTable`, through its `ref`. Ids are row ids (see `getRowId`).
 * Elements exist only for mounted rows: rows of the current page inside the mounted window.
 */
export type BTTableHandle = {
  /**
   * Scrolls the row into view, default `align: 'start'`. A row outside the mounted window is
   * mounted first; in client mode a row on another page moves the table to its page. Returns
   * false when the row is not displayed: filtered out, or (server and manual mode) not on the
   * current page. The scroll lands after the next commit when the row was not mounted yet.
   * A controlled `page` must take the new page in the same update as `onPageChange` (set
   * state in the callback); otherwise the request is dropped at the next commit.
   */
  scrollToRow: (id: RowId, options?: { align?: RowAlign }) => boolean;
  /** The row's `<tr>`, or null when it is not mounted. */
  getRowElement: (id: RowId) => HTMLTableRowElement | null;
  /** The row's `<td>` of the column, or null when the row is not mounted or the key is unknown. */
  getCellElement: (id: RowId, columnKey: string) => HTMLTableCellElement | null;
  /**
   * Brings the row into view (`align: 'nearest'`), then focuses the cell's first focusable
   * element, else the cell itself (made focusable with `tabIndex=-1`). Returns false like
   * `scrollToRow`, or for an unknown column key.
   */
  focusCell: (id: RowId, columnKey: string) => boolean;
  /** Unselects every row (reported through `onSelectionChange`). */
  clearSelection: () => void;
  /** What a new `resetKey` does: search and filters back to their defaults, page 1, scroll to the top. */
  resetView: () => void;
};

/** What the handle reads, refreshed after every commit. */
export type HandleInput<R> = {
  scrollRef: RefObject<HTMLElement | null>;
  /** The scroll area has no height limit (`maxHeight: 'none'`): the page scrolls instead. */
  pageScroll: boolean;
  entries: readonly RowEntry<R>[];
  /** Identity of the view on screen (page, sort, search, filters, resets). */
  viewKey: string;
  columns: readonly Column<R>[];
  selectable: boolean;
  /** The leading detail toggle column is on (`renderDetail`). */
  expandable?: boolean;
  elements: ReadonlyMap<RowId, HTMLTableRowElement>;
  virtual: { enabled: boolean; offsets: readonly number[]; jumpTo: (top: number) => void };
  page: number;
  setPage: (page: number) => void;
  /** Client mode: the page of a displayed row, null when filtered out. Paged modes: none. */
  findPage?: (id: RowId) => number | null;
  clearSelection: () => void;
  resetView: () => void;
};

/**
 * A pending `scrollToRow` / `focusCell`. `viewKey` is the view it was last aimed at: a new
 * view (page change) scrolls back to the top in the same commit, so the window on screen is
 * stale and the request must jump again instead of landing.
 */
type ScrollRequest = { id: RowId; align: RowAlign; focusKey?: string; jumped: boolean; viewKey: string };

type Live<R> = { input: HandleInput<R> | null; pending: ScrollRequest | null };

/** The box of a row and its open detail row together, the unit `scrollToRow` aligns. */
function unitRect(row: HTMLElement): { top: number; bottom: number; height: number } {
  const rect = row.getBoundingClientRect();
  const detail = detailRowOf(row);
  if (!detail) return rect;
  const bottom = detail.getBoundingClientRect().bottom;
  return { top: rect.top, bottom, height: bottom - rect.top };
}

/** How far to scroll so the row (with its open detail row) sits at `align` in the area below the sticky header. */
function alignDelta(scroller: HTMLElement, row: HTMLElement, align: RowAlign): number {
  const box = scroller.getBoundingClientRect();
  const head = scroller.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const top = box.top + head;
  const bottom = box.top + scroller.clientHeight;
  const rect = unitRect(row);
  if (align === 'start') return rect.top - top;
  if (align === 'end') return rect.bottom - bottom;
  if (align === 'center') return (rect.top + rect.bottom - top - bottom) / 2;
  if (rect.top < top || rect.height > bottom - top) return rect.top - top;
  return rect.bottom > bottom ? rect.bottom - bottom : 0;
}

/** The `<td>` of `columnKey` in a mounted row, after the detail toggle and selection cells. */
function cellOf<R>(input: HandleInput<R>, row: HTMLTableRowElement, columnKey: string): HTMLTableCellElement | null {
  const index = input.columns.findIndex((column) => column.key === columnKey);
  if (index < 0) return null;
  return row.cells[index + leadingCount(input)] ?? null;
}

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusCellElement(cell: HTMLTableCellElement | null): void {
  if (!cell) return;
  const target = cell.querySelector<HTMLElement>(FOCUSABLE);
  if (target) return target.focus();
  cell.tabIndex = -1;
  cell.focus();
}

/** Scrolls the mounted row to its alignment, then focuses the requested cell. */
function reveal<R>(input: HandleInput<R>, row: HTMLTableRowElement, request: ScrollRequest): void {
  const scroller = input.scrollRef.current;
  if (input.pageScroll) row.scrollIntoView?.({ block: request.align });
  else if (scroller) scroller.scrollTop += alignDelta(scroller, row, request.align);
  if (request.focusKey !== undefined) focusCellElement(cellOf(input, row, request.focusKey));
}

/** True when the mounted window may not match the scroll position: virtualized and the view just changed. */
function staleWindow<R>(input: HandleInput<R>, request: ScrollRequest): boolean {
  return input.virtual.enabled && input.viewKey !== request.viewKey;
}

/**
 * Finishes the pending request: reveals its row once mounted in a window that matches the
 * scroll position; a displayed row outside the virtual window (or on a view that just
 * changed) is scrolled to by its offset and lands on a later commit; otherwise the request
 * is dropped.
 */
function settle<R>(live: Live<R>): void {
  const { input, pending: request } = live;
  if (!input || !request) return;
  const row = input.elements.get(request.id);
  if (row && !staleWindow(input, request)) {
    live.pending = null;
    return reveal(input, row, request);
  }
  const index = input.entries.findIndex((entry) => entry.id === request.id);
  const retry = !request.jumped || staleWindow(input, request);
  if (index < 0 || !retry || !input.virtual.enabled) {
    live.pending = null;
    return;
  }
  live.pending = { ...request, jumped: true, viewKey: input.viewKey };
  input.virtual.jumpTo(input.virtual.offsets[index] ?? 0);
}

/** The page showing the row: client mode asks `findPage`; paged modes only know the current page. */
function pageOf<R>(input: HandleInput<R>, id: RowId): number | null {
  if (input.findPage) return input.findPage(id);
  return input.entries.some((entry) => entry.id === id) ? input.page : null;
}

/** Starts a scroll request: moves to the row's page, or settles it at once on this page. */
function startRequest<R>(live: Live<R>, next: Omit<ScrollRequest, 'jumped' | 'viewKey'>): boolean {
  const input = live.input;
  const page = input ? pageOf(input, next.id) : null;
  if (!input || page === null) return false;
  live.pending = { ...next, jumped: false, viewKey: input.viewKey };
  if (page === input.page) settle(live);
  else input.setPage(page);
  return true;
}

function createHandle<R>(live: Live<R>): BTTableHandle {
  const element = (id: RowId) => live.input?.elements.get(id) ?? null;
  return {
    scrollToRow: (id, options) => startRequest(live, { id, align: options?.align ?? 'start' }),
    getRowElement: element,
    getCellElement: (id, columnKey) => {
      const row = element(id);
      return row && live.input ? cellOf(live.input, row, columnKey) : null;
    },
    focusCell: (id, columnKey) => {
      if (!live.input?.columns.some((column) => column.key === columnKey)) return false;
      return startRequest(live, { id, align: 'nearest', focusKey: columnKey });
    },
    clearSelection: () => live.input?.clearSelection(),
    resetView: () => live.input?.resetView(),
  };
}

/**
 * Exposes `BTTableHandle` on `ref`. The input is refreshed after every commit (layout
 * effect), which is also when a pending `scrollToRow` / `focusCell` lands.
 */
export function useTableHandle<R>(ref: Ref<BTTableHandle> | undefined, input: HandleInput<R>): void {
  const live = useRef<Live<R>>({ input: null, pending: null });
  useBrowserLayoutEffect(() => {
    live.current.input = input;
    settle(live.current);
  });
  useImperativeHandle(ref, () => createHandle(live.current), []);
}
