import { type Dispatch, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { Column, FilterState, FilterValue } from '../core/types';
import { defaultFilters as columnDefaults, mergeChanges, NO_PROPOSALS, type TableAction, type TableState, tableReducer, type Transition } from './tableReducer';
import { useLatest } from './useLatest';
import { type Answers, classify, recordProposals, settleProposals } from './proposals';
import { controlledState, reportChanges, sameFilters, type ViewStateProps } from './viewState';

/** Input of `useTableState`: the table props that drive view state in both data modes. */
export type TableStateOptions<R> = ViewStateProps & {
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
  /** Empties the search (at once) and every filter, back to page 1, as one reported change. */
  clearAll: () => void;
  toggleSort: (key: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  /** What a new `resetKey` does: search and filters back to their defaults, page 1. */
  resetView: () => void;
};

/** Applies one action to the state on screen, updates the own state and reports the changes. */
export type ApplyAction = (action: TableAction) => void;

type Ref<T> = { current: T };

const DEFAULT_PAGE_SIZE = 100;
/** Default quiet time, in ms, before typed search (and, in server mode, typed filters) apply. */
export const DEFAULT_DEBOUNCE_MS = 250;

function pageSizeOf<R>(options: TableStateOptions<R>): number {
  return Number(options.pageSize ?? DEFAULT_PAGE_SIZE);
}

/** The filters `resetKey` goes back to: `defaultFilters` merged over the column defaults. */
function resetFilters<R>(options: TableStateOptions<R>): FilterState {
  return { ...columnDefaults(options.columns), ...options.defaultFilters };
}

/** The action of a reset: search and filters back to their defaults. */
function resetAction<R>(options: TableStateOptions<R>): TableAction {
  return { type: 'reset', filters: resetFilters(options), search: options.defaultSearchValue ?? '' };
}

function initState<R>(options: TableStateOptions<R>): TableState {
  const search = options.searchValue ?? options.defaultSearchValue ?? '';
  const filters = options.filters ?? resetFilters(options);
  const sort = options.sort === undefined ? (options.defaultSort ?? null) : options.sort;
  const page = options.page ?? options.defaultPage ?? 1;
  return { searchInput: search, search, filters, sort, page, pageSize: pageSizeOf(options), resets: 0, clears: 0, proposals: NO_PROPOSALS };
}

/**
 * Applies the typed search after `delay` ms of quiet; each keystroke restarts the wait. Text
 * already proposed (`proposed`, the own applied search) is not applied again, so a value the
 * parent rejected is reported once.
 */
function useSearchDebounce(state: TableState, proposed: string, apply: ApplyAction, delay: number): void {
  const pending = state.searchInput !== state.search && state.searchInput !== proposed;
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => apply({ type: 'applySearch' }), delay);
    return () => clearTimeout(timer);
  }, [state.searchInput, pending, delay, apply]);
}

/** The props `usePropSync` watches for changes made by the parent. */
type Watched = { pageSize: number; resetKey: unknown; page?: number; searchValue?: string; filters?: FilterState };

type Changes = { pageSize: boolean; reset: boolean; search: boolean; filters: boolean };

/** `Object.is` so a NaN prop counts as unchanged instead of re-rendering forever. */
function sameWatched(a: Watched, b: Watched): boolean {
  const sameKeys = Object.is(a.pageSize, b.pageSize) && Object.is(a.resetKey, b.resetKey) && Object.is(a.page, b.page);
  return sameKeys && a.searchValue === b.searchValue && a.filters === b.filters;
}

/**
 * The parent's answers since `seen`. A controlled search or filters value equal to the own
 * value, or to any reported value still waiting for its echo, is not a change of its own.
 */
function answersOf(seen: Watched, next: Watched, own: TableState): Answers {
  const { searches, filters } = own.proposals;
  return {
    search: classify({ previous: seen.searchValue, next: next.searchValue, own: own.search, waiting: searches }, Object.is),
    searchValue: next.searchValue,
    filters: classify({ previous: seen.filters, next: next.filters, own: own.filters, waiting: filters }, sameFilters),
    filterValue: next.filters,
    pageChanged: !Object.is(seen.page, next.page),
  };
}

function changesOf(seen: Watched, next: Watched, answers: Answers): Changes {
  const search = answers.search === 'change';
  const filters = answers.filters === 'change';
  return { pageSize: !Object.is(seen.pageSize, next.pageSize), reset: !Object.is(seen.resetKey, next.resetKey), search, filters };
}

/** The state after the parent's changes: page size, search and filter changes go to page 1, then `resetKey`. */
function syncedState<R>(from: TableState, changes: Changes, options: TableStateOptions<R>): TableState {
  let to = from;
  if (changes.search) to = { ...to, searchInput: to.search };
  if (changes.search || changes.filters || changes.pageSize) to = { ...to, page: 1 };
  if (changes.reset) to = tableReducer(to, resetAction(options));
  return to;
}

/**
 * The transition of the parent's changes. `from` already holds the parent's values, so only
 * what the table changed itself (page 1, the reset values) is reported. A page moved under a
 * controlled page is held on screen until the page prop changes or the table's next move.
 */
function parentTransition<R>(own: TableState, changes: Changes, options: TableStateOptions<R>): Transition {
  const pageSize = changes.pageSize ? pageSizeOf(options) : own.pageSize;
  const from = { ...controlledState(own, options), pageSize };
  const to = recordProposals(from, syncedState(from, changes, options));
  if (options.page === undefined || to.page === from.page) return { from, to };
  return { from, to: { ...to, proposals: { ...to.proposals, pageHold: options.page } } };
}

/**
 * Applies the parent's changes during render: a new `pageSize`, a new `resetKey`, and a
 * controlled search or filters value set by the parent (not an echo); settles the proposals
 * the parent answered. Returns the last transition made here, for reporting after commit.
 */
function usePropSync<R>(own: TableState, dispatch: Dispatch<Transition>, options: TableStateOptions<R>): Transition | null {
  const { resetKey, page, searchValue, filters } = options;
  const next: Watched = { pageSize: pageSizeOf(options), resetKey, page, searchValue, filters };
  const [seen, setSeen] = useState(next);
  const [report, setReport] = useState<Transition | null>(null);
  if (sameWatched(seen, next)) return report;
  setSeen(next);
  const answers = answersOf(seen, next, own);
  const settled = { ...own, proposals: settleProposals(own.proposals, answers) };
  const changes = changesOf(seen, next, answers);
  if (!Object.values(changes).some(Boolean)) {
    if (settled.proposals !== own.proposals) dispatch({ from: own, to: settled });
    return report;
  }
  const transition = parentTransition(settled, changes, options);
  dispatch({ from: own, to: transition.to });
  setReport(transition);
  return transition;
}

/** Reports each transition made during render once, after it commits. */
function useReport(report: Transition | null, callbacksRef: Ref<ViewStateProps>): void {
  useEffect(() => {
    if (report) reportChanges(report.from, report.to, callbacksRef.current);
  }, [report, callbacksRef]);
}

/**
 * The single way the table changes its view state: the action runs on the state on screen
 * (controlled props applied), the fields it changed go into the own state, and each is
 * reported. Fields it did not change keep their own value, so a late echo of an earlier
 * change is still recognised as one. The latest state is written at once so calls in one handler compose.
 */
function useApply(dispatch: Dispatch<Transition>, latestRef: Ref<TableState>, callbacksRef: Ref<ViewStateProps>): ApplyAction {
  return useCallback(
    (action: TableAction) => {
      const current = latestRef.current;
      const next = recordProposals(current, tableReducer(current, action));
      latestRef.current = next;
      dispatch({ from: current, to: next });
      reportChanges(current, next, callbacksRef.current);
    },
    [dispatch, latestRef, callbacksRef],
  );
}

function useActions<R>(apply: ApplyAction, optionsRef: Ref<TableStateOptions<R>>): TableActions {
  return useMemo(
    () => ({
      setSearch: (text: string) => apply({ type: 'type', text }),
      clearSearch: () => {
        apply({ type: 'type', text: '' });
        apply({ type: 'applySearch' });
      },
      setFilter: (key: string, value: FilterValue) => apply({ type: 'filter', key, value }),
      clearAll: () => apply({ type: 'clearAll' }),
      toggleSort: (key: string) => apply({ type: 'sort', key }),
      setPage: (page: number) => apply({ type: 'page', page }),
      setPageSize: (pageSize: number) => apply({ type: 'pageSize', pageSize }),
      resetView: () => apply(resetAction(optionsRef.current)),
    }),
    [apply, optionsRef],
  );
}

/**
 * View state shared by client and server mode: debounced search, filters (defaults applied
 * once and on `resetKey`), the sort cycle, page and page size with the reset-to-page-1 rules
 * of `tableReducer`, and a resynced `pageSize` prop. Each piece is controlled when its prop
 * is defined; every change the table makes, reset rules included, goes to the callbacks
 * (from handlers and timers, or after commit for changes made during render, never during
 * render). `state` is the state on screen; `apply` is for changes the caller derives (page
 * clamping).
 */
export function useTableState<R>(options: TableStateOptions<R>) {
  const [own, dispatch] = useReducer(mergeChanges, options, initState);
  const report = usePropSync(own, dispatch, options);
  const state = controlledState(own, options);
  const latestRef = useLatest(state);
  const callbacksRef = useLatest(options);
  useReport(report, callbacksRef);
  const apply = useApply(dispatch, latestRef, callbacksRef);
  useSearchDebounce(state, own.search, apply, options.searchDebounceMs ?? DEFAULT_DEBOUNCE_MS);
  return { state, apply, actions: useActions(apply, callbacksRef) };
}
