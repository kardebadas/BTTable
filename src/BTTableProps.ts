import type { ErrorInfo, ReactNode } from 'react';
import type { ControlProps } from './components/Controls';
import type { RowCallbacks } from './components/TableBody';
import type { Column, FetchRows, Query } from './core/types';
import type { VirtualizeMode } from './core/virtual';
import type { RowId, RowSource } from './hooks/rowModel';
import type { ClientTableState } from './hooks/useClientTable';
import type { SelectionChange } from './hooks/useSelection';
import type { ViewStateProps } from './hooks/viewState';
import type { BTTableLabels } from './labels';

/** What `renderSelectionBar` receives. */
export type SelectionBarContext<R> = { selectedIds: RowId[]; selectedRows: R[]; clear: () => void };

/** Props of `BTTable` shared by every data mode. */
export type BTTableCommonProps<R> = RowCallbacks<R> &
  ControlProps &
  ViewStateProps & {
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
  /** Client mode only: `false` shows every filtered row. Server and manual mode always paginate (development warning). */
  pagination?: boolean;
  pageSize?: number;
  searchDebounceMs?: number;
  /**
   * Changing it puts search and filters back to their defaults (`defaultSearchValue`,
   * `defaultFilters`, column defaults) and goes back to page 1, keeping sort and page size.
   */
  resetKey?: unknown;
  /** Server and manual mode: changing it sends (manual: emits) the current query again. */
  refreshKey?: unknown;
  /**
   * Server mode: called with each query sent to `fetchRows` (for URL sync etc.). Manual
   * mode (required): called with each query the parent must load.
   */
  onQueryChange?: (query: Query) => void;
  onStateChange?: (state: ClientTableState<R>) => void;
  /**
   * Checkbox column. In server and manual mode select-all covers the current page, and selected ids
   * are never pruned (rows on other pages are not loaded): clear stale ids through a
   * controlled `selectedIds`. Turning it off clears the selection (reported once).
   */
  selectable?: boolean;
  selectedIds?: readonly RowId[];
  defaultSelectedIds?: readonly RowId[];
  /**
   * Called after every selection change with the ids and the selected rows the table knows:
   * client mode every selected row (filtered-out ones included); server and manual mode the
   * rows of any page seen while selected. Ids never seen have no row.
   */
  onSelectionChange?: SelectionChange<R>;
  /**
   * A bar between the toolbar and the table, shown while at least one row is selected
   * (`selectable` only): `clear` unselects every row.
   */
  renderSelectionBar?: (ctx: SelectionBarContext<R>) => ReactNode;
  /** Number px or CSS size; `'none'` turns the inner vertical scroll and virtualization off. Default 600. */
  maxHeight?: number | string;
  /** Mount only the rows near the viewport: `'auto'` (default) above `virtualizeThreshold` rows, `true`, `false`. */
  virtualize?: VirtualizeMode;
  /** Row count above which `virtualize: 'auto'` turns on. Default 100. */
  virtualizeThreshold?: number;
  /** Px assumed for a row until it is measured; real heights replace it. Default 40. */
  estimatedRowHeight?: number;
  /** Shows the loading state. Manual mode: pass `true` while the parent loads a page. */
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
export type BTTableClientProps<R> = BTTableCommonProps<R> & { rows: RowSource<R>; fetchRows?: never } & NoManualProps;

/**
 * Server mode: the data source, called for each page. A new function identity does not
 * refetch: change `refreshKey` to refetch (e.g. when the fetcher captures a tenant id).
 */
export type BTTableServerProps<R> = BTTableCommonProps<R> & { fetchRows: FetchRows<R>; rows?: never } & NoManualProps;

/** The manual-mode props, absent in the other modes. */
type NoManualProps = { mode?: never; totalRows?: never; totalFilteredRows?: never };

/**
 * Manual mode: the parent loads each page. The table never fetches: it calls
 * `onQueryChange` with the same `Query` as server mode, on the same schedule, and renders
 * the `rows` passed back (one page, an array or a map) with their totals. Missing totals
 * count the rows up to this page and offer a next page after a full one. Pass `loading`
 * while a page loads; dropping stale responses is the parent's job.
 */
export type BTTableManualProps<R> = BTTableCommonProps<R> & {
  mode: 'manual';
  rows: RowSource<R>;
  fetchRows?: never;
  onQueryChange: (query: Query) => void;
  /** Rows before search and filters; the counter's "filtered from". */
  totalRows?: number;
  /** Rows matching search and filters; default `totalRows`. Pages and the counter come from it. */
  totalFilteredRows?: number;
};

/**
 * Props of `BTTable`: `rows` (client mode), `fetchRows` (server mode), or `mode="manual"`
 * with `rows` and `onQueryChange` (manual mode).
 */
export type BTTableProps<R> = BTTableClientProps<R> | BTTableServerProps<R> | BTTableManualProps<R>;

/** The props as the table reads them inside: any mode, checked at runtime. */
export type BTTableAnyProps<R> = BTTableCommonProps<R> & {
  rows?: RowSource<R>;
  fetchRows?: FetchRows<R>;
  mode?: 'manual';
  totalRows?: number;
  totalFilteredRows?: number;
};
