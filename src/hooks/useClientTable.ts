import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampPage, pageCount, paginate } from '../core/pagination';
import type { Column, FilterState, SortState } from '../core/types';
import { buildEntries, type RowEntry, type RowId, type RowSource } from './rowModel';
import { RowIndex } from './rowIndex';
import type { TableState } from './tableReducer';
import { useLatest } from './useLatest';
import { type Expansion, type ExpansionProps, useExpansion } from './useExpansion';
import { type Selection, type SelectionChange, useSelection } from './useSelection';
import { type ApplyAction, type TableActions, useTableState } from './useTableState';
import type { ViewStateProps } from './viewState';

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
export type UseClientTableOptions<R> = ViewStateProps &
  ExpansionProps<R> & {
  /** An array, or an object map whose keys are the id fallback. */
  rows: RowSource<R>;
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
  onSelectionChange?: SelectionChange<R>;
  /** The checkbox column; turning it off clears the selection. */
  selectable?: boolean;
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
  selection: Selection<R>;
  /** Expanded detail rows; ids of rows gone from `rows` are pruned like selected ids. */
  expansion: Expansion;
  /** Starts building the search texts in the background (the search box got focus). */
  warmSearch: () => void;
};

/** `ClientTableState` with the filtered entries instead of their rows, which are listed only when reported. */
type ReportedState<R> = Omit<ClientTableState<R>, 'filteredRows'> & { sorted: RowEntry<R>[] };

/** Same fields and the same filtered rows in the same order; a different list of the same rows counts as the same. */
function sameState<R>(a: ReportedState<R>, b: ReportedState<R>): boolean {
  const sameFields = a.search === b.search && a.filters === b.filters && a.sort === b.sort;
  if (!sameFields || a.page !== b.page || a.pageSize !== b.pageSize) return false;
  if (a.sorted === b.sorted) return true;
  return a.sorted.length === b.sorted.length && a.sorted.every((entry, i) => entry.row === b.sorted[i].row);
}

/** Calls `onStateChange` at mount and whenever a reported field or the filtered rows change. */
function useStateChange<R>(state: ReportedState<R>, onStateChange?: (state: ClientTableState<R>) => void): void {
  const callback = useLatest(onStateChange);
  const last = useRef<ReportedState<R> | null>(null);
  const listed = useRef<{ sorted: RowEntry<R>[]; rows: R[] } | null>(null);
  useEffect(() => {
    if (last.current && sameState(last.current, state)) return;
    last.current = state;
    if (!callback.current) return;
    const { sorted, ...fields } = state;
    // The same filtered list keeps its rows array, as when it was memoized per list.
    if (listed.current?.sorted !== sorted) listed.current = { sorted, rows: sorted.map((entry) => entry.row) };
    callback.current({ ...fields, filteredRows: listed.current.rows });
  });
}

/**
 * True from the first render whose search box text or applied search is not blank, or once
 * `warm` is called (the search box got focus), and from then on: a table nobody searches
 * never builds its search texts.
 */
function useSearchUsed(state: TableState): { used: boolean; warm: () => void } {
  const [used, setUsed] = useState(false);
  const warm = useCallback(() => setUsed(true), []);
  const active = state.searchInput.trim() !== '' || state.search.trim() !== '';
  if (active && !used) setUsed(true);
  return { used: used || active, warm };
}

/**
 * Once search is in use, builds the search texts of the row index in short slices between
 * frames, so the keystrokes typed during the debounce do the work and later row lists are
 * ready before the next search. Nothing is built before.
 */
function useWarmSearch<R>(index: RowIndex<R>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      if (!index.warmSearch(8)) timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => clearTimeout(timer);
  }, [index, enabled]);
}

/** Searched → filtered → sorted rows, memoized per input, on per-row values cached in a `RowIndex`. */
function useFilteredRows<R>(options: UseClientTableOptions<R>, state: TableState) {
  const { rows, columns, getRowId } = options;
  const entries = useMemo(() => buildEntries(rows, getRowId), [rows, getRowId]);
  const index = useMemo(() => new RowIndex(entries, columns), [entries, columns]);
  const { used, warm } = useSearchUsed(state);
  useWarmSearch(index, used);
  const { search, filters, sort } = state;
  const searched = useMemo(() => index.search(search), [index, search]);
  const filtered = useMemo(() => index.filter(searched, filters), [index, searched, filters]);
  const sorted = useMemo(() => index.sort(filtered, sort), [index, filtered, sort]);
  return { entries, sorted, warmSearch: warm };
}

/**
 * Moves the state to the page on screen when clamping changed it, after commit, so a
 * controlled page hears of it through `onPageChange`. Runs again only when either page changes.
 */
function useClampReport(page: number, statePage: number, apply: ApplyAction): void {
  useEffect(() => {
    if (page !== statePage) apply({ type: 'page', page });
  }, [page, statePage, apply]);
}

/**
 * Client-mode table state: debounced search, filters (defaults applied once and on
 * `resetKey`), the asc → desc → none sort cycle, paging with reset-to-1 and clamping, the
 * derived filtered → sorted → paged rows, row selection and `onStateChange`.
 */
export function useClientTable<R>(options: UseClientTableOptions<R>): ClientTable<R> {
  const { state, apply, actions } = useTableState(options);
  const { entries, sorted, warmSearch } = useFilteredRows(options, state);

  const size = options.pagination === false ? 0 : state.pageSize;
  const page = clampPage(state.page, sorted.length, size);
  useClampReport(page, state.page, apply);
  const pageRows = useMemo(() => paginate(sorted, page, size), [sorted, page, size]);

  const { search, filters, sort, pageSize } = state;
  useStateChange({ search, filters, sort, page, pageSize, sorted }, options.onStateChange);

  const presentIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);
  const scopeIds = useMemo(() => sorted.map((entry) => entry.id), [sorted]);
  const { selectedIds, defaultSelectedIds, onSelectionChange } = options;
  const selection = useSelection({ scopeIds, presentIds, selectedIds, defaultSelectedIds, onSelectionChange, entries, enabled: Boolean(options.selectable) });
  const expansion = useExpansion(options, presentIds);

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
    expansion,
    warmSearch,
  };
}
