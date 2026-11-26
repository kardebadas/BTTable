import type { Column, FilterState, FilterValue, SortState } from '../core/types';

/** Client table view state. `searchInput` is what was typed; `search` is the applied term. */
export type TableState = {
  searchInput: string;
  search: string;
  filters: FilterState;
  sort: SortState;
  page: number;
  pageSize: number;
  /** How many times `resetKey` has reset the view; part of the view key. */
  resets: number;
  /** How many times "Clear all" was used; server mode sends the cleared query at once. */
  clears: number;
  /** What the table proposed for controlled pieces and has not heard back about. */
  proposals: Proposals;
};

/** Proposals still waiting for the parent's answer. */
export type Proposals = {
  /** The page prop the table moved away from; while the prop still equals it, the own page shows. */
  pageHold?: number;
  /** Reported search values not yet echoed back, oldest first. */
  searches: readonly string[];
  /** Reported filter states not yet echoed back, oldest first. */
  filters: readonly FilterState[];
};

/** No proposal waiting. */
export const NO_PROPOSALS: Proposals = { searches: [], filters: [] };

/** State transitions of the client table. */
export type TableAction =
  | { type: 'type'; text: string }
  | { type: 'applySearch' }
  | { type: 'filter'; key: string; value: FilterValue }
  | { type: 'sort'; key: string }
  | { type: 'page'; page: number }
  | { type: 'pageSize'; pageSize: number }
  | { type: 'reset'; filters: FilterState; search: string }
  | { type: 'clearAll' };

/** A transition of the view state: the state it started from and the state it produced. */
export type Transition = { from: TableState; to: TableState };

/** The `defaultValue` of every column filter that has one, keyed by column key. */
export function defaultFilters<R>(columns: readonly Column<R>[]): FilterState {
  const filters: FilterState = {};
  for (const column of columns) {
    const spec = column.filter;
    if (spec && spec.type !== 'notEmpty' && spec.defaultValue !== undefined) filters[column.key] = spec.defaultValue;
  }
  return filters;
}

/** Sort cycle for a header click: another column → asc, asc → desc, desc → none. */
export function nextSort(sort: SortState, key: string): SortState {
  if (sort?.key !== key) return { key, direction: 'asc' };
  if (sort.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

/** Sets one filter and goes back to page 1; the current value is a no-op. */
function setFilter(state: TableState, key: string, value: FilterValue): TableState {
  if (Object.is(state.filters[key], value)) return state;
  return { ...state, filters: { ...state.filters, [key]: value }, page: 1 };
}

/** Applies the typed search and goes back to page 1; the applied text is a no-op. */
function applySearch(state: TableState): TableState {
  return state.search === state.searchInput ? state : { ...state, search: state.searchInput, page: 1 };
}

/**
 * Reducer of the table's own state: `state` with every field that differs (`Object.is`)
 * between `from` and `to` taken from `to`. The other fields keep their value, so a change
 * made over controlled props never overwrites the table's own value of a field it did not
 * change.
 */
export function mergeChanges(state: TableState, { from, to }: Transition): TableState {
  const changed = Object.entries(to).filter(([key, value]) => !Object.is(from[key as keyof TableState], value));
  return changed.length === 0 ? state : { ...state, ...Object.fromEntries(changed) };
}

/**
 * Reducer of the view state. Applying a new search, changing a filter or the page size,
 * and resetting (to the given defaults) go back to page 1; sorting resets nothing. Setting
 * a filter to its current value is a no-op. `clearAll` empties the search (no debounce) and
 * every filter at once and goes back to page 1.
 */
export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'type':
      return { ...state, searchInput: action.text };
    case 'applySearch':
      return applySearch(state);
    case 'filter':
      return setFilter(state, action.key, action.value);
    case 'sort':
      return { ...state, sort: nextSort(state.sort, action.key) };
    case 'page':
      return state.page === action.page ? state : { ...state, page: action.page };
    case 'pageSize':
      return { ...state, pageSize: Number(action.pageSize), page: 1 };
    case 'clearAll':
      return { ...state, searchInput: '', search: '', filters: {}, page: 1, clears: state.clears + 1 };
    case 'reset':
      return { ...state, searchInput: action.search, search: action.search, filters: action.filters, page: 1, resets: state.resets + 1 };
  }
}
