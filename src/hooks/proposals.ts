import type { FilterState } from '../core/types';
import type { Proposals, TableState } from './tableReducer';
import { sameFilters, sameSort } from './viewState';

/** How many reported values wait for their echo at most; older ones are forgotten. */
const MAX_WAITING = 10;

/** How the parent's new value of one controlled prop relates to the table's proposals. */
export type Answer = 'none' | 'echo' | 'change';

type Same<T> = (a: T, b: T) => boolean;

/** True when `to` changes a field the callbacks report. */
function reportsChange(from: TableState, to: TableState): boolean {
  const viewChanged = from.search !== to.search || !sameFilters(from.filters, to.filters) || !sameSort(from.sort, to.sort);
  return viewChanged || from.pageSize !== to.pageSize || from.page !== to.page;
}

function append<T>(list: readonly T[], value: T): readonly T[] {
  return [...list, value].slice(-MAX_WAITING);
}

/**
 * `to` with the search and filters reported since `from` recorded as waiting for their echo.
 * Any reported change also ends a page hold (the table's next move replaces it); the search
 * and filters holds of a reset stay until their prop changes, so a move made before the
 * parent's echo never brings the pre-reset values back.
 */
export function recordProposals(from: TableState, to: TableState): TableState {
  if (!reportsChange(from, to)) return to;
  const { searches, filters, searchHold, filtersHold } = to.proposals;
  return {
    ...to,
    proposals: {
      searchHold,
      filtersHold,
      searches: from.search === to.search ? searches : append(searches, to.search),
      filters: sameFilters(from.filters, to.filters) ? filters : append(filters, to.filters),
    },
  };
}

/** A controlled prop's last seen and new value, the own value and the values waiting for an echo. */
export type PropUpdate<T> = { previous?: T; next?: T; own: T; waiting: readonly T[] };

/**
 * Classifies a controlled prop that may have changed: `none` (same identity, or equal to
 * the own value), `echo` (equal to a value still waiting for its echo, even an older one),
 * or `change` (a value the parent chose).
 */
export function classify<T>({ previous, next, own, waiting }: PropUpdate<T>, same: Same<T>): Answer {
  if (next === undefined || next === previous) return 'none';
  if (waiting.some((item) => same(item, next))) return 'echo';
  return same(next, own) ? 'none' : 'change';
}

/** An echo settles its value and every older one; a parent change drops them all. */
function settle<T>(waiting: readonly T[], answer: Answer, value: T | undefined, same: Same<T>): readonly T[] {
  if (answer === 'none' || value === undefined) return waiting;
  if (answer === 'change') return [];
  const index = waiting.map((item) => same(item, value)).lastIndexOf(true);
  return waiting.slice(index + 1);
}

/** The parent's answers to the waiting proposals; a new page prop ends the page hold. */
export type Answers = { search: Answer; searchValue?: string; filters: Answer; filterValue?: FilterState; pageChanged: boolean };

/** A hold kept while the prop still equals it; any other value (or none) ends it. */
function keepHold<T>(hold: T | undefined, prop: T | undefined, same: Same<T>): T | undefined {
  return hold !== undefined && prop !== undefined && same(hold, prop) ? hold : undefined;
}

/** The holds left after the parent's answers: a new page, search or filters prop ends its hold. */
function settleHolds(proposals: Proposals, answers: Answers): Pick<Proposals, 'pageHold' | 'searchHold' | 'filtersHold'> {
  return {
    pageHold: answers.pageChanged ? undefined : proposals.pageHold,
    searchHold: keepHold(proposals.searchHold, answers.searchValue, Object.is),
    filtersHold: keepHold(proposals.filtersHold, answers.filterValue, sameFilters),
  };
}

/** The proposals still waiting after the parent's answers. */
export function settleProposals(proposals: Proposals, answers: Answers): Proposals {
  const searches = settle(proposals.searches, answers.search, answers.searchValue, Object.is);
  const filters = settle(proposals.filters, answers.filters, answers.filterValue, sameFilters);
  const holds = settleHolds(proposals, answers);
  const sameHolds = holds.pageHold === proposals.pageHold && holds.searchHold === proposals.searchHold && holds.filtersHold === proposals.filtersHold;
  const same = sameHolds && searches === proposals.searches && filters === proposals.filters;
  return same ? proposals : { ...holds, searches, filters };
}
