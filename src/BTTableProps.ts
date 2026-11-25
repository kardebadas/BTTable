import type { ErrorInfo, ReactNode } from 'react';
import type { ControlProps } from './components/Controls';
import type { RowCallbacks } from './components/TableBody';
import type { Column, FetchRows, Query } from './core/types';
import type { VirtualizeMode } from './core/virtual';
import type { RowId, RowSource } from './hooks/rowModel';
import type { ClientTableState } from './hooks/useClientTable';
import type { BTTableLabels } from './labels';

/** Props of `BTTable` shared by both data modes. */
export type BTTableCommonProps<R> = RowCallbacks<R> &
  ControlProps & {
  /** Should be stable (memoized): a new array re-derives and re-renders every row on every parent render. */
  columns: readonly Column<R>[];
  /**
   * Default: `row.id ?? row.ID ?? row.INDEX ?? row.N_ID`, else the map key (rows given as
   * a map), else the index; `index` is the array index or the map position. Selection needs
   * stable ids; in server mode the index is the position within the page, so ids collide
   * across pages: server rows need real ids. Should be stable (memoized): a new function
   * re-derives every row on every parent render.
   */
  getRowId?: (row: R, index: number) => RowId;
  /** Client mode only: `false` shows every filtered row. Server mode always paginates (development warning). */
  pagination?: boolean;
  pageSize?: number;
  searchDebounceMs?: number;
  /** Changing it clears search and filters and goes back to page 1, keeping sort and page size. */
  resetKey?: unknown;
  /** Server mode: changing it sends the current query again. */
  refreshKey?: unknown;
  /** Server mode: called with each query sent to `fetchRows` (for URL sync etc.). */
  onQueryChange?: (query: Query) => void;
  onStateChange?: (state: ClientTableState<R>) => void;
  /**
   * Checkbox column. In server mode select-all covers the current page, and selected ids
   * are never pruned (rows on other pages are not loaded): clear stale ids through a
   * controlled `selectedIds`.
   */
  selectable?: boolean;
  selectedIds?: readonly RowId[];
  defaultSelectedIds?: readonly RowId[];
  onSelectionChange?: (ids: RowId[]) => void;
  /** Number px or CSS size; `'none'` turns the inner vertical scroll and virtualization off. Default 600. */
  maxHeight?: number | string;
  /** Mount only the rows near the viewport: `'auto'` (default) above `virtualizeThreshold` rows, `true`, `false`. */
  virtualize?: VirtualizeMode;
  /** Row count above which `virtualize: 'auto'` turns on. Default 100. */
  virtualizeThreshold?: number;
  /** Px assumed for a row until it is measured; real heights replace it. Default 40. */
  estimatedRowHeight?: number;
  loading?: boolean;
  emptyMessage?: ReactNode;
  /** Visually hidden table caption, for assistive technology. */
  caption?: ReactNode;
  /** `false` renders no `<thead>`: no sort buttons and no select-all box. Default true. */
  showTableHeader?: boolean;
  className?: string;
  /** Extra class on the `<table>`. */
  tableClassName?: string;
  /** Extra class on the `<thead>`. */
  theadClassName?: string;
  /** Extra class on the `<tbody>`. */
  tbodyClassName?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
  labels?: Partial<BTTableLabels>;
};

/**
 * Client mode: the rows in memory, an array or an object map (values in property order,
 * keys as the id fallback). Should be stable (memoized): a new array re-filters and
 * re-sorts every row; it keeps the scroll position unless the view (page, sort, search,
 * filters) changes.
 */
export type BTTableClientProps<R> = BTTableCommonProps<R> & { rows: RowSource<R>; fetchRows?: never };

/**
 * Server mode: the data source, called for each page. A new function identity does not
 * refetch: change `refreshKey` to refetch (e.g. when the fetcher captures a tenant id).
 */
export type BTTableServerProps<R> = BTTableCommonProps<R> & { fetchRows: FetchRows<R>; rows?: never };

/** Props of `BTTable`: exactly one of `rows` (client mode) or `fetchRows` (server mode). */
export type BTTableProps<R> = BTTableClientProps<R> | BTTableServerProps<R>;

/** The props as the table reads them inside: either source, checked at runtime. */
export type BTTableAnyProps<R> = BTTableCommonProps<R> & { rows?: RowSource<R>; fetchRows?: FetchRows<R> };
