import type { FilterState, FilterValue, SortState } from '../core/types';
import type { TableState } from './tableReducer';

/** Change callbacks of the view state; each also fires in uncontrolled mode. */
export type ViewStateCallbacks = {
  /** Called with the applied (debounced) search text, not with every keystroke. */
  onSearchChange?: (text: string) => void;
  onFiltersChange?: (filters: FilterState) => void;
  onSortChange?: (sort: SortState) => void;
  /** Also called when a reset rule moves the table back to page 1, and when the page is clamped. */
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

/**
 * Controlled and uncontrolled view state. A defined controlled prop wins over the table's own
 * state; the table then only proposes changes through the callbacks.
 */
export type ViewStateProps = ViewStateCallbacks & {
  /** Controlled applied search text. The box shows what is typed; this is the debounced value. */
  searchValue?: string;
  /** Initial search text (uncontrolled); also what `resetKey` goes back to. */
  defaultSearchValue?: string;
  /** Controlled filter values, keyed by column key. */
  filters?: FilterState;
  /** Initial filter values, merged over the columns' `filter.defaultValue`; also what `resetKey` goes back to. */
  defaultFilters?: FilterState;
  /** Controlled sort; `null` is a controlled "no sort". */
  sort?: SortState;
  /** Initial sort (uncontrolled). */
  defaultSort?: SortState;
  /** Controlled 1-based page. */
  page?: number;
  /** Initial page (uncontrolled). */
  defaultPage?: number;
};

/** `Object.is`, or two arrays (multiselect values, ranges) with `Object.is`-equal elements. */
function sameFilterValue(a: FilterValue, b: FilterValue): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => Object.is(item, b[index]));
}

/**
 * True when both filter states hold the same keys with equal values; array values compare
 * element by element, so a fresh `['a']` on each parent render is no change.
 */
export function sameFilters(a: FilterState, b: FilterState): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameFilterValue(a[key], b[key]));
}

/** True when both sorts are none, or the same column and direction. */
export function sameSort(a: SortState, b: SortState): boolean {
  return a?.key === b?.key && a?.direction === b?.direction;
}

/**
 * The controlled prop when given and different from `own`; else `own`, so an equal literal
 * keeps identity. A prop still equal to `hold` (the value a reset moved away from, not yet
 * answered by the parent) also shows `own`.
 */
function pick<T>(prop: T | undefined, own: T, same: (a: T, b: T) => boolean, hold?: T): T {
  if (prop === undefined || same(prop, own)) return own;
  if (hold !== undefined && same(prop, hold)) return own;
  return prop;
}

/**
 * The page on screen: the page prop, except while it still equals the page the table moved
 * away from during render (a reset rule) and the parent has not answered yet.
 */
function pageOnScreen(state: TableState, page: number | undefined): number {
  if (page === undefined || Object.is(page, state.proposals.pageHold)) return state.page;
  return page;
}

/** The view state on screen: the table's own state with every controlled prop applied over it. */
export function controlledState(state: TableState, props: ViewStateProps): TableState {
  return {
    ...state,
    search: pick(props.searchValue, state.search, Object.is, state.proposals.searchHold),
    filters: pick(props.filters, state.filters, sameFilters, state.proposals.filtersHold),
    sort: pick(props.sort, state.sort, sameSort),
    page: pageOnScreen(state, props.page),
  };
}

function notify<T>(callback: ((value: T) => void) | undefined, changed: boolean, value: T): void {
  if (changed) callback?.(value);
}

/** Calls the callback of every field that differs between `from` and `to`, the page last. */
export function reportChanges(from: TableState, to: TableState, callbacks: ViewStateCallbacks): void {
  notify(callbacks.onSearchChange, from.search !== to.search, to.search);
  notify(callbacks.onFiltersChange, !sameFilters(from.filters, to.filters), to.filters);
  notify(callbacks.onSortChange, !sameSort(from.sort, to.sort), to.sort);
  notify(callbacks.onPageSizeChange, from.pageSize !== to.pageSize, to.pageSize);
  notify(callbacks.onPageChange, from.page !== to.page, to.page);
}
