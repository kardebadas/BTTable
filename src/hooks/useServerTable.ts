import { useCallback, useMemo, useState } from 'react';
import { type CounterData, getCounter, pageCount } from '../core/pagination';
import { buildQuery, typedFiltersKey } from '../core/query';
import type { Column, FetchResult, FetchRows, FilterState, Query, SortState } from '../core/types';
import { getRowId as defaultGetRowId } from '../core/values';
import { buildEntries, type RowEntry, type RowId } from './rowModel';
import { useServerFetch } from './useServerFetch';
import { type Selection, useSelection } from './useSelection';
import { type ApplyAction, DEFAULT_DEBOUNCE_MS, type TableActions, useTableState } from './useTableState';
import type { ViewStateProps } from './viewState';

/** Input of `useServerTable`; the server-mode subset of the table props. */
export type UseServerTableOptions<R> = ViewStateProps & {
  fetchRows: FetchRows<R>;
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
  onSelectionChange?: (ids: RowId[]) => void;
};

/** Server table state, the current page's rows and actions, as consumed by the table components. */
export type ServerTable<R> = TableActions & {
  searchInput: string;
  filters: FilterState;
  sort: SortState;
  page: number;
  pageCount: number;
  pageSize: number;
  /** The rows of the last accepted response as sent, none after a failure (invalid entries included). */
  responseRows: readonly R[];
  /** The valid rows of `responseRows`; `index` is the position within the page. */
  pageRows: RowEntry<R>[];
  /**
   * Identity of the view on screen: the query (and resets) of the shown response. The
   * scroll position resets when it changes, not when the same query is answered again.
   */
  viewKey: string;
  /** `undefined` hides the counter: before the first response and after a failure. */
  counter: CounterData | null | undefined;
  loading: boolean;
  /** The current request failed. */
  error: boolean;
  /** Sends the current query again. */
  retry: () => void;
  selection: Selection;
};

const NO_ROWS: never[] = [];

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

/** The filtered total of a response (`totalFilteredRows`, else `totalRows`), when it is a valid count. */
function filteredTotal<R>(result: FetchResult<R>): number | null {
  const total = result.totalFilteredRows ?? result.totalRows;
  return isCount(total) ? total : null;
}

/** Moves to the last page when a response says the current page no longer exists. */
function clampToResult<R>(apply: ApplyAction, query: Query, result: FetchResult<R>): void {
  const total = filteredTotal(result);
  if (total === null) return;
  const last = pageCount(total, query.pageSize);
  if (query.page > last) apply({ type: 'page', page: last });
}

/** Counter over the server totals; without valid totals it counts the rows up to this page. */
function serverCounter<R>(result: FetchResult<R>, query: Query): CounterData | null {
  const { totalRows, totalFilteredRows = totalRows } = result;
  return getCounter({ page: query.page, pageSize: query.pageSize, total: totalFilteredRows, unfilteredTotal: totalRows, pageRowCount: result.rows.length });
}

/**
 * Pages known from the last response. Without a valid total a full page may have more
 * after it, so one more page is offered.
 */
function serverPageCount<R>(result: FetchResult<R> | null, query: Query): number {
  if (!result) return 1;
  const total = filteredTotal(result);
  if (total !== null) return pageCount(total, query.pageSize);
  const full = result.rows.length > 0 && result.rows.length === query.pageSize;
  return full ? query.page + 1 : query.page;
}

/** The request generation: bumped by `refreshKey`, `resetKey` and Retry, each forcing one fetch. */
function useGeneration<R>(options: UseServerTableOptions<R>) {
  const [retries, setRetries] = useState(0);
  const retry = useCallback(() => setRetries((count) => count + 1), []);
  const generation = useChangeCount(options.refreshKey) + useChangeCount(options.resetKey) + retries;
  return { generation, retry };
}

/**
 * Server-mode table: the shared view state (`useTableState`) turned into a `Query` sent
 * through `fetchRows` (`useServerFetch`), the page clamped to the reported total, the
 * counter from the server totals, and selection whose select-all box covers the current
 * page while ids on other pages stay selected.
 */
export function useServerTable<R>(options: UseServerTableOptions<R>): ServerTable<R> {
  const { state, apply, actions } = useTableState(options);
  const { generation, retry } = useGeneration(options);
  const query = buildQuery(state, options.columns);
  const onResult = useCallback((sent: Query, result: FetchResult<R>) => clampToResult(apply, sent, result), [apply]);
  const delay = options.searchDebounceMs ?? DEFAULT_DEBOUNCE_MS;
  const queryKey = JSON.stringify(query);
  const keys = { queryKey, viewKey: `${state.resets}:${queryKey}`, typedKey: typedFiltersKey(query), generation };
  const fetchInput = { fetchRows: options.fetchRows, query, ...keys, delay, onQueryChange: options.onQueryChange, onResult };
  const { result, viewKey, loading, error } = useServerFetch(fetchInput);

  const getRowId = options.getRowId ?? defaultGetRowId;
  // After a failure no rows show, so select-all and export cover nothing stale.
  const rows = error ? NO_ROWS : (result?.rows ?? NO_ROWS);
  const pageRows = useMemo(() => buildEntries(rows, getRowId), [rows, getRowId]);
  const scopeIds = useMemo(() => pageRows.map((entry) => entry.id), [pageRows]);
  const { selectedIds, defaultSelectedIds, onSelectionChange } = options;
  const selection = useSelection({ scopeIds, selectedIds, defaultSelectedIds, onSelectionChange });
  // Hidden (`undefined`) until the first response and after a failure, rather than "No records".
  const counter = result && !error ? serverCounter(result, query) : undefined;

  return {
    ...actions,
    searchInput: state.searchInput,
    filters: state.filters,
    sort: state.sort,
    page: state.page,
    pageCount: serverPageCount(result, query),
    pageSize: state.pageSize,
    viewKey,
    responseRows: rows,
    pageRows,
    counter,
    loading,
    error,
    retry,
    selection,
  };
}
