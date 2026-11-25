import type { Column, FilterState, FilterValue, SortState } from '../core/types';

/** Client table view state. `searchInput` is what was typed; `search` is the applied term. */
export type TableState = {
  searchInput: string;
  search: string;
  filters: FilterState;
  sort: SortState;
  page: number;
  pageSize: number;
};

/** State transitions of the client table. */
export type TableAction =
  | { type: 'type'; text: string }
  | { type: 'applySearch' }
  | { type: 'filter'; key: string; value: FilterValue }
  | { type: 'sort'; key: string }
  | { type: 'page'; page: number }
  | { type: 'pageSize'; pageSize: number }
  | { type: 'reset'; filters: FilterState };

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

/**
 * Reducer of the client table. Applying a new search, changing a filter or the page size,
 * and resetting go back to page 1; sorting resets nothing. Setting a filter to its current
 * value is a no-op.
 */
export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'type':
      return { ...state, searchInput: action.text };
    case 'applySearch':
      return state.search === state.searchInput ? state : { ...state, search: state.searchInput, page: 1 };
    case 'filter':
      return setFilter(state, action.key, action.value);
    case 'sort':
      return { ...state, sort: nextSort(state.sort, action.key) };
    case 'page':
      return state.page === action.page ? state : { ...state, page: action.page };
    case 'pageSize':
      return { ...state, pageSize: Number(action.pageSize), page: 1 };
    case 'reset':
      return { ...state, searchInput: '', search: '', filters: action.filters, page: 1 };
  }
}
