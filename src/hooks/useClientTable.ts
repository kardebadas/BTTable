import { type Dispatch, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { clampPage, pageCount, paginate } from '../core/pagination';
import type { Column, FilterState, FilterValue, SortState } from '../core/types';
import { getRowId as defaultGetRowId } from '../core/values';
import { buildEntries, filterEntries, type RowEntry, type RowId, sortEntries } from './rowModel';
import { defaultFilters, type TableAction, type TableState, tableReducer } from './tableReducer';
import { useLatest } from './useLatest';
import { type Selection, useSelection } from './useSelection';

/** What `onStateChange` receives: the applied state plus every filtered, sorted row. */
export type ClientTableState<R> = {
  search: string;
  filters: FilterState;
  sort: SortState;
  page: number;
  pageSize: number;
  filteredRows: R[];
};

/** Input of `useClientTable`; the client-mode subset of the table props. */
export type UseClientTableOptions<R> = {
  rows: readonly R[];
  /** Should be stable (memoized): a new array re-filters and re-sorts every row. */
  columns: readonly Column<R>[];
  /** Should be stable (memoized): a new function re-derives every row. */
  getRowId?: (row: R, index: number) => RowId;
  pagination?: boolean;
  pageSize?: number;
  searchDebounceMs?: number;
  resetKey?: unknown;
  onStateChange?: (state: ClientTableState<R>) => void;
  selectedIds?: readonly RowId[];
  defaultSelectedIds?: readonly RowId[];
  onSelectionChange?: (ids: RowId[]) => void;
};

/** Client table state, derived rows and actions, as consumed by the table components. */
export type ClientTable<R> = {
  /** The search box text; `search` is the debounced term actually applied. */
  searchInput: string;
  search: string;
  filters: FilterState;
  sort: SortState;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Valid rows before search and filters. */
  totalRows: number;
  /** Every row passing search and filters, sorted. */
  filteredRows: RowEntry<R>[];
  /** The rows of the current page (all filtered rows when pagination is off). */
  pageRows: RowEntry<R>[];
  setSearch: (text: string) => void;
  setFilter: (key: string, value: FilterValue) => void;
  toggleSort: (key: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  selection: Selection;
};

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DEBOUNCE_MS = 250;

function initState<R>(options: UseClientTableOptions<R>): TableState {
  const pageSize = Number(options.pageSize ?? DEFAULT_PAGE_SIZE);
  return { searchInput: '', search: '', filters: defaultFilters(options.columns), sort: null, page: 1, pageSize };
}

/** Applies the typed search after `delay` ms of quiet; each keystroke restarts the wait. */
function useSearchDebounce(state: TableState, dispatch: Dispatch<TableAction>, delay: number): void {
  const pending = state.searchInput !== state.search;
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => dispatch({ type: 'applySearch' }), delay);
    return () => clearTimeout(timer);
  }, [state.searchInput, pending, delay, dispatch]);
}

type PropResetInput<R> = { pageSize: number; resetKey: unknown; columns: readonly Column<R>[] };

/**
 * Resyncs a changed `pageSize` prop and applies a changed `resetKey`, during render.
 * `Object.is` so a NaN prop counts as unchanged instead of re-rendering forever.
 */
function usePropResets<R>(dispatch: Dispatch<TableAction>, { pageSize, resetKey, columns }: PropResetInput<R>): void {
  const [seen, setSeen] = useState({ pageSize, resetKey });
  const pageSizeChanged = !Object.is(seen.pageSize, pageSize);
  const resetKeyChanged = !Object.is(seen.resetKey, resetKey);
  if (!pageSizeChanged && !resetKeyChanged) return;
  setSeen({ pageSize, resetKey });
  if (pageSizeChanged) dispatch({ type: 'pageSize', pageSize });
  if (resetKeyChanged) dispatch({ type: 'reset', filters: defaultFilters(columns) });
}

function sameState<R>(a: ClientTableState<R>, b: ClientTableState<R>): boolean {
  const sameFields = a.search === b.search && a.filters === b.filters && a.sort === b.sort;
  if (!sameFields || a.page !== b.page || a.pageSize !== b.pageSize) return false;
  if (a.filteredRows === b.filteredRows) return true;
  return a.filteredRows.length === b.filteredRows.length && a.filteredRows.every((row, i) => row === b.filteredRows[i]);
}

/** Calls `onStateChange` at mount and whenever a reported field or the filtered rows change. */
function useStateChange<R>(state: ClientTableState<R>, onStateChange?: (state: ClientTableState<R>) => void): void {
  const callback = useLatest(onStateChange);
  const last = useRef<ClientTableState<R> | null>(null);
  useEffect(() => {
    if (last.current && sameState(last.current, state)) return;
    last.current = state;
    callback.current?.(state);
  });
}

function useActions(dispatch: Dispatch<TableAction>) {
  return useMemo(
    () => ({
      setSearch: (text: string) => dispatch({ type: 'type', text }),
      setFilter: (key: string, value: FilterValue) => dispatch({ type: 'filter', key, value }),
      toggleSort: (key: string) => dispatch({ type: 'sort', key }),
      setPage: (page: number) => dispatch({ type: 'page', page }),
      setPageSize: (pageSize: number) => dispatch({ type: 'pageSize', pageSize }),
    }),
    [dispatch],
  );
}

/** Filtered → sorted rows, memoized per input. */
function useFilteredRows<R>(options: UseClientTableOptions<R>, state: TableState) {
  const { rows, columns, getRowId = defaultGetRowId } = options;
  const entries = useMemo(() => buildEntries(rows, getRowId), [rows, getRowId]);
  const { search, filters, sort } = state;
  const filtered = useMemo(() => filterEntries({ entries, columns, search, filters }), [entries, columns, search, filters]);
  const sorted = useMemo(() => sortEntries(filtered, columns, sort), [filtered, columns, sort]);
  return { entries, sorted };
}

/**
 * Client-mode table state: debounced search, filters (defaults applied once and on
 * `resetKey`), the asc → desc → none sort cycle, paging with reset-to-1 and clamping, the
 * derived filtered → sorted → paged rows, row selection and `onStateChange`.
 */
export function useClientTable<R>(options: UseClientTableOptions<R>): ClientTable<R> {
  const [state, dispatch] = useReducer(tableReducer, options, initState);
  const pageSizeProp = Number(options.pageSize ?? DEFAULT_PAGE_SIZE);
  usePropResets(dispatch, { pageSize: pageSizeProp, resetKey: options.resetKey, columns: options.columns });
  useSearchDebounce(state, dispatch, options.searchDebounceMs ?? DEFAULT_DEBOUNCE_MS);
  const { entries, sorted } = useFilteredRows(options, state);

  const size = options.pagination === false ? 0 : state.pageSize;
  const page = clampPage(state.page, sorted.length, size);
  if (page !== state.page) dispatch({ type: 'page', page });
  const pageRows = useMemo(() => paginate(sorted, page, size), [sorted, page, size]);

  const filteredRows = useMemo(() => sorted.map((entry) => entry.row), [sorted]);
  const { search, filters, sort, pageSize } = state;
  useStateChange({ search, filters, sort, page, pageSize, filteredRows }, options.onStateChange);

  const presentIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);
  const scopeIds = useMemo(() => sorted.map((entry) => entry.id), [sorted]);
  const { selectedIds, defaultSelectedIds, onSelectionChange } = options;
  const selection = useSelection({ scopeIds, presentIds, selectedIds, defaultSelectedIds, onSelectionChange });

  return {
    ...useActions(dispatch),
    searchInput: state.searchInput,
    search,
    filters,
    sort,
    page,
    pageCount: pageCount(sorted.length, size),
    pageSize,
    totalRows: entries.length,
    filteredRows: sorted,
    pageRows,
    selection,
  };
}
