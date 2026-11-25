import { useEffect, useMemo, useRef } from 'react';
import { clampPage, pageCount, paginate } from '../core/pagination';
import type { Column, FilterState, SortState } from '../core/types';
import { getRowId as defaultGetRowId } from '../core/values';
import { buildEntries, filterEntries, type RowEntry, type RowId, sortEntries } from './rowModel';
import type { TableState } from './tableReducer';
import { useLatest } from './useLatest';
import { type Selection, useSelection } from './useSelection';
import { type TableActions, useTableState } from './useTableState';

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
export type ClientTable<R> = TableActions & {
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
  /**
   * Identity of the view: applied search, filters, sort, page, page size and resets. The
   * scroll position resets when it changes, not when only the data does.
   */
  viewKey: string;
  /** Every valid row, in `rows` order, before search and filters. */
  entries: RowEntry<R>[];
  /** Every row passing search and filters, sorted. */
  filteredRows: RowEntry<R>[];
  /** The rows of the current page (all filtered rows when pagination is off). */
  pageRows: RowEntry<R>[];
  selection: Selection;
};

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
  const { state, dispatch, actions } = useTableState(options);
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
    ...actions,
    searchInput: state.searchInput,
    search,
    filters,
    sort,
    page,
    pageCount: pageCount(sorted.length, size),
    pageSize,
    viewKey: JSON.stringify([state.resets, search, filters, sort, page, pageSize]),
    totalRows: entries.length,
    entries,
    filteredRows: sorted,
    pageRows,
    selection,
  };
}
