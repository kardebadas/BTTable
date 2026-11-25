import { type Dispatch, useEffect, useMemo, useReducer, useState } from 'react';
import type { Column, FilterValue } from '../core/types';
import { defaultFilters, type TableAction, type TableState, tableReducer } from './tableReducer';

/** Input of `useTableState`: the table props that drive view state in both data modes. */
export type TableStateOptions<R> = {
  columns: readonly Column<R>[];
  pageSize?: number;
  searchDebounceMs?: number;
  resetKey?: unknown;
};

/** Actions on the view state, stable for the life of the table. */
export type TableActions = {
  setSearch: (text: string) => void;
  /** Empties the search box and applies the empty search at once, without the debounce. */
  clearSearch: () => void;
  setFilter: (key: string, value: FilterValue) => void;
  toggleSort: (key: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
};

const DEFAULT_PAGE_SIZE = 100;
/** Default quiet time, in ms, before typed search (and, in server mode, typed filters) apply. */
export const DEFAULT_DEBOUNCE_MS = 250;

function pageSizeOf<R>(options: TableStateOptions<R>): number {
  return Number(options.pageSize ?? DEFAULT_PAGE_SIZE);
}

function initState<R>(options: TableStateOptions<R>): TableState {
  return { searchInput: '', search: '', filters: defaultFilters(options.columns), sort: null, page: 1, pageSize: pageSizeOf(options), resets: 0 };
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

function useActions(dispatch: Dispatch<TableAction>): TableActions {
  return useMemo(
    () => ({
      setSearch: (text: string) => dispatch({ type: 'type', text }),
      clearSearch: () => {
        dispatch({ type: 'type', text: '' });
        dispatch({ type: 'applySearch' });
      },
      setFilter: (key: string, value: FilterValue) => dispatch({ type: 'filter', key, value }),
      toggleSort: (key: string) => dispatch({ type: 'sort', key }),
      setPage: (page: number) => dispatch({ type: 'page', page }),
      setPageSize: (pageSize: number) => dispatch({ type: 'pageSize', pageSize }),
    }),
    [dispatch],
  );
}

/**
 * View state shared by client and server mode: debounced search, filters (defaults applied
 * once and on `resetKey`), the sort cycle, page and page size with the reset-to-page-1 rules
 * of `tableReducer`, and a resynced `pageSize` prop.
 */
export function useTableState<R>(options: TableStateOptions<R>) {
  const [state, dispatch] = useReducer(tableReducer, options, initState);
  usePropResets(dispatch, { pageSize: pageSizeOf(options), resetKey: options.resetKey, columns: options.columns });
  useSearchDebounce(state, dispatch, options.searchDebounceMs ?? DEFAULT_DEBOUNCE_MS);
  return { state, dispatch, actions: useActions(dispatch) };
}
