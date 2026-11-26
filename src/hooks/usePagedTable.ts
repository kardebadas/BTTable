import { useCallback, useMemo, useState } from 'react';
import { type CounterData, getCounter, pageCount } from '../core/pagination';
import { buildQuery, typedFiltersKey } from '../core/query';
import type { Column, FilterState, Query, SortState } from '../core/types';
import type { TableState } from './tableReducer';
import { buildEntries, type RowEntry, type RowId, type RowSource, sourceSize } from './rowModel';
import { type Expansion, type ExpansionProps, useExpansion } from './useExpansion';
import { type Selection, type SelectionChange, useSelection } from './useSelection';
import { type ApplyAction, DEFAULT_DEBOUNCE_MS, type TableActions, useTableState } from './useTableState';
import type { ViewStateProps } from './viewState';

/** The table props shared by server and manual mode: the server pages, sorts and filters the rows. */
export type PagedTableOptions<R> = ViewStateProps &
  ExpansionProps<R> & {
  /** Should be stable (memoized). */
  columns: readonly Column<R>[];
  /** Should be stable (memoized): a new function re-derives every row. */
  getRowId?: (row: R, index: number) => RowId;
  pageSize?: number;
  /** Quiet time before typed search or filter text is sent. Default 250 ms. */
  searchDebounceMs?: number;
  resetKey?: unknown;
  refreshKey?: unknown;
  onQueryChange?: (query: Query) => void;
  selectedIds?: readonly RowId[];
  defaultSelectedIds?: readonly RowId[];
  onSelectionChange?: SelectionChange<R>;
  /** The checkbox column; turning it off clears the selection. */
  selectable?: boolean;
};

/** One page as the server answered it: a fetch result, or the props of manual mode. */
export type PageResult<R> = { rows: RowSource<R>; totalRows?: number; totalFilteredRows?: number };

/** Paged table state, the current page's rows and actions, as consumed by the table components. */
export type PagedTable<R> = TableActions & {
  searchInput: string;
  filters: FilterState;
  sort: SortState;
  page: number;
  pageCount: number;
  pageSize: number;
  /** The rows of the page on screen as given, none after a failure (invalid entries included). */
  responseRows: RowSource<R>;
  /** The valid rows of `responseRows`; `index` is the position within the page. */
  pageRows: RowEntry<R>[];
  /**
   * Identity of the view on screen. The scroll position resets when it changes, not when
   * the same query is answered again.
   */
  viewKey: string;
  /** `undefined` hides the counter (no page to count yet, or a failure). */
  counter: CounterData | null | undefined;
  loading: boolean;
  /** The current request failed. */
  error: boolean;
  /** Sends the current query again. */
  retry: () => void;
  selection: Selection<R>;
  /** Expanded detail rows; never pruned (rows on other pages are not loaded). */
  expansion: Expansion;
  /** The query of the view state (what `fetchAllRows` is called with, without paging). */
  query: Query;
};

/** An empty page. */
export const NO_ROWS: never[] = [];

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** A number that goes up by one each time `value` changes (`Object.is`), adjusted during render. */
function useChangeCount(value: unknown): number {
  const [seen, setSeen] = useState({ value, count: 0 });
  if (Object.is(seen.value, value)) return seen.count;
  const next = { value, count: seen.count + 1 };
  setSeen(next);
  return next.count;
}

/** The filtered total of a page (`totalFilteredRows`, else `totalRows`), when it is a valid count. */
export function filteredTotal<R>(result: PageResult<R>): number | null {
  const total = result.totalFilteredRows ?? result.totalRows;
  return isCount(total) ? total : null;
}

/** Moves to the last page when a valid filtered `total` says the current page no longer exists. */
export function clampToTotal(apply: ApplyAction, { page, pageSize }: Pick<Query, 'page' | 'pageSize'>, total: number | null): void {
  if (total === null) return;
  const last = pageCount(total, pageSize);
  if (page > last) apply({ type: 'page', page: last });
}

/** Counter over the server totals; without valid totals it counts the rows up to this page. */
function serverCounter<R>(result: PageResult<R>, query: Query): CounterData | null {
  const { totalRows, totalFilteredRows = totalRows } = result;
  const pageRowCount = sourceSize(result.rows);
  return getCounter({ page: query.page, pageSize: query.pageSize, total: totalFilteredRows, unfilteredTotal: totalRows, pageRowCount });
}

/**
 * Pages known from the page on screen. Without a valid total a full page may have more
 * after it, so one more page is offered.
 */
function serverPageCount<R>(result: PageResult<R> | null, query: Query): number {
  if (!result) return 1;
  const total = filteredTotal(result);
  if (total !== null) return pageCount(total, query.pageSize);
  const size = sourceSize(result.rows);
  const full = size > 0 && size === query.pageSize;
  return full ? query.page + 1 : query.page;
}

type ClearsSeen = { clears: number; queryKey: string; landed: number };

/**
 * How many "Clear all" uses changed the query on screen to a cleared one (no search, no
 * filters), adjusted during render. A clear is settled in the render that applies it: a
 * controlled clear counts when the parent echoes it in that render; one that changes
 * nothing (only unapplied typing to drop) or that the parent rejects never counts, so later
 * typing stays debounced.
 */
function useLandedClears(clears: number, query: Query, queryKey: string): number {
  const [seen, setSeen] = useState<ClearsSeen>({ clears, queryKey, landed: 0 });
  if (seen.clears === clears && seen.queryKey === queryKey) return seen.landed;
  const cleared = query.search === '' && Object.keys(query.filters).length === 0;
  const lands = seen.clears !== clears && seen.queryKey !== queryKey && cleared;
  const next = { clears, queryKey, landed: seen.landed + (lands ? 1 : 0) };
  setSeen(next);
  return next.landed;
}

/**
 * The request generation, bumped by `refreshKey`, a reset (`resetKey`, `resetView`) and Retry:
 * each sends the query again, at once. `landedClears` counts landed "Clear all" uses: each
 * sends its query at once, but not again when it is the query already on screen.
 */
function useGeneration<R>(options: PagedTableOptions<R>, state: TableState, query: Query, queryKey: string) {
  const [retries, setRetries] = useState(0);
  const retry = useCallback(() => setRetries((count) => count + 1), []);
  const generation = useChangeCount(options.refreshKey) + state.resets + retries;
  return { generation, landedClears: useLandedClears(state.clears, query, queryKey), retry };
}

/**
 * The view state (`useTableState`) as a server `Query`, with the keys that schedule its
 * requests: `queryKey` (the query), `viewKey` (query plus resets), `typedKey` (the
 * debounced part), `generation` (refresh, reset, retry) and `landedClears`.
 */
export function usePagedQuery<R>(options: PagedTableOptions<R>) {
  const { state, apply, actions } = useTableState(options);
  const query = buildQuery(state, options.columns);
  const queryKey = JSON.stringify(query);
  const { generation, landedClears, retry } = useGeneration(options, state, query, queryKey);
  const keys = { queryKey, viewKey: `${state.resets}:${queryKey}`, typedKey: typedFiltersKey(query), generation, landedClears };
  const delay = options.searchDebounceMs ?? DEFAULT_DEBOUNCE_MS;
  return { state, apply, actions, query, keys, delay, retry };
}

/** What `usePagedQuery` returns. */
export type PagedQuery<R> = ReturnType<typeof usePagedQuery<R>>;

/** The page on screen: the result its totals come from, its rows, and whether the counter shows. */
export type PageView<R> = { result: PageResult<R> | null; rows: RowSource<R>; showCounter: boolean };

/**
 * The page on screen turned into table state: entries with ids, selection whose select-all
 * box covers this page while ids on other pages stay selected, the counter and the page count.
 */
export function usePageModel<R>(options: PagedTableOptions<R>, paged: PagedQuery<R>, view: PageView<R>) {
  const { state, actions, query, retry } = paged;
  const { result, rows } = view;
  // Without getRowId, buildEntries falls back to the row's id, then its map key, then its index.
  const { getRowId } = options;
  const pageRows = useMemo(() => buildEntries(rows, getRowId), [rows, getRowId]);
  const scopeIds = useMemo(() => pageRows.map((entry) => entry.id), [pageRows]);
  const { selectedIds, defaultSelectedIds, onSelectionChange } = options;
  const selection = useSelection({ scopeIds, selectedIds, defaultSelectedIds, onSelectionChange, entries: pageRows, enabled: Boolean(options.selectable) });
  const expansion = useExpansion(options);
  return {
    ...actions,
    searchInput: state.searchInput,
    filters: state.filters,
    sort: state.sort,
    page: state.page,
    pageCount: serverPageCount(result, query),
    pageSize: state.pageSize,
    responseRows: rows,
    pageRows,
    counter: result && view.showCounter ? serverCounter(result, query) : undefined,
    retry,
    selection,
    expansion,
    query,
  };
}
