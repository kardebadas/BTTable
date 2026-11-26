import { sortKey } from '../core/compare';
import { type FilterKey, filterKey, filterMatcher, isFilterActive } from '../core/filters';
import { orderByRanks, type SortRanks, sortRanks } from '../core/sortRanks';
import { matchesSearch, rowSearchText, SEARCH_TEXT_SEPARATOR } from '../core/search';
import type { Column, FilterSpec, FilterState, SortState } from '../core/types';
import { getColumnValue } from '../core/values';
import type { RowEntry } from './rowModel';

/** Rows rechecked between two clock reads while warming the search texts. */
const WARM_CHUNK = 2000;

/** The last search: its normalised term and the entries it kept. */
type LastSearch<R> = { needle: string; result: RowEntry<R>[] };

/**
 * Per-row values derived once per `entries` × `columns` pair, so a keystroke, filter change
 * or sort click does not recompute them for every row: the lowercase search text, each
 * filter column's `filterKey` and each sort column's dense `sortRanks`. Values are stored by
 * `entry.index` and built on first use. Results match `filterRows` and `sortEntries`
 * exactly, as long as rows and the column functions are pure (React's own memo contract).
 */
export class RowIndex<R> {
  private readonly entries: RowEntry<R>[];
  private readonly columns: readonly Column<R>[];
  private readonly texts: string[] = [];
  private warmed = 0;
  private readonly filterKeys = new Map<Column<R>, FilterKey[]>();
  private readonly ranks = new Map<Column<R>, SortRanks>();
  private last: LastSearch<R> | null = null;

  /** `entries` are every valid row; `columns` the table's columns. */
  constructor(entries: RowEntry<R>[], columns: readonly Column<R>[]) {
    this.entries = entries;
    this.columns = columns;
  }

  /** Builds search texts for about `budgetMs`; true once every row has one. */
  warmSearch(budgetMs: number): boolean {
    const end = performance.now() + budgetMs;
    while (this.warmed < this.entries.length) {
      const stop = Math.min(this.warmed + WARM_CHUNK, this.entries.length);
      for (; this.warmed < stop; this.warmed += 1) {
        const entry = this.entries[this.warmed];
        this.texts[entry.index] = rowSearchText(entry.row, this.columns);
      }
      if (performance.now() >= end) break;
    }
    return this.warmed === this.entries.length;
  }

  /**
   * The entries matching `term` (`matchesSearch`), in order: one `includes` per row on the
   * prebuilt texts. A term that extends the previous one only rechecks the previous result.
   */
  search(term: string): RowEntry<R>[] {
    const needle = term.trim().toLowerCase();
    if (needle === '') return this.entries;
    if (needle.includes(SEARCH_TEXT_SEPARATOR)) return this.entries.filter((entry) => matchesSearch(entry.row, this.columns, term));
    if (this.last?.needle === needle) return this.last.result;
    const base = this.last && needle.includes(this.last.needle) ? this.last.result : this.entries;
    this.warmSearch(Infinity);
    const texts = this.texts;
    const result = base.filter((entry) => texts[entry.index].includes(needle));
    this.last = { needle, result };
    return result;
  }

  /** The `entries` passing every active column filter, in order; the same list when none is active. */
  filter(entries: RowEntry<R>[], filters: FilterState): RowEntry<R>[] {
    const active = this.columns.filter((column) => column.filter && isFilterActive(column.filter, filters[column.key]));
    if (active.length === 0) return entries;
    const tests = active.map((column) => ({
      keys: this.filterKeysOf(column, entries),
      matches: filterMatcher(column.filter as FilterSpec, filters[column.key]),
    }));
    return entries.filter((entry) => tests.every(({ keys, matches }) => matches(keys[entry.index])));
  }

  /**
   * `entries` stably sorted by the sort column (as `sortEntries`) with a counting sort on
   * ranks built once per column, which later sorts reuse in either direction. An unknown
   * sort key leaves the list unchanged.
   */
  sort(entries: RowEntry<R>[], sort: SortState): RowEntry<R>[] {
    const column = sort && this.columns.find((candidate) => candidate.key === sort.key);
    if (!sort || !column) return entries;
    const { ranks, count } = this.ranksOf(column);
    return orderByRanks({ items: entries, rankOf: (entry) => ranks[entry.index], count, direction: sort.direction });
  }

  /** `filterKey` of `column` for every row of `entries`, computing the missing ones. */
  private filterKeysOf(column: Column<R>, entries: RowEntry<R>[]): FilterKey[] {
    const keys = cached(this.filterKeys, column);
    const spec = column.filter as FilterSpec;
    for (const entry of entries) {
      if (keys[entry.index] === undefined) keys[entry.index] = filterKey(spec, getColumnValue(column, entry.row));
    }
    return keys;
  }

  /** Ranks of `column`'s sort value (`sortValue`, else its value) for every row, by `entry.index`. */
  private ranksOf(column: Column<R>): SortRanks {
    const known = this.ranks.get(column);
    if (known) return known;
    const read = column.sortValue ?? ((row: R) => getColumnValue(column, row));
    const byPosition = sortRanks(this.entries.map((entry) => sortKey(read(entry.row))));
    const size = this.entries.length === 0 ? 0 : this.entries[this.entries.length - 1].index + 1;
    const ranks = new Int32Array(size);
    this.entries.forEach((entry, position) => {
      ranks[entry.index] = byPosition.ranks[position];
    });
    const result = { ranks, count: byPosition.count };
    this.ranks.set(column, result);
    return result;
  }
}

/** The array stored under `column`, created empty on first use. */
function cached<R, T>(store: Map<Column<R>, T[]>, column: Column<R>): T[] {
  let keys = store.get(column);
  if (!keys) {
    keys = [];
    store.set(column, keys);
  }
  return keys;
}
