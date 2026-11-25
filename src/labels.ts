/**
 * Every UI string of the table, in English by default; `labels` overrides any of them.
 * `{name}` placeholders are filled in by the table.
 */
export type BTTableLabels = {
  /** Status strip text while `loading`. */
  loading: string;
  /** Fallback text after a render error. */
  error: string;
  /** Accessible name of the search box. */
  search: string;
  /** Accessible name of the button that clears the search box. */
  clearSearch: string;
  /** Counter text; `{from}`, `{to}` and `{total}` are formatted numbers. */
  counter: string;
  /** Appended to the counter when filtering hid rows; `{total}` is the unfiltered count. */
  counterFiltered: string;
  /** Counter text when there are no records. */
  noRecords: string;
  /** Text of the CSV export button. */
  exportCsv: string;
  /** Accessible name of the pagination `<nav>`. */
  pagination: string;
  previousPage: string;
  nextPage: string;
  /** Accessible name of the page number input. */
  page: string;
  /** Text after the page number input; `{count}` is the number of pages. */
  pageOf: string;
  /** Label of the page-size select. */
  pageSize: string;
  /** Accessible name of the header checkbox. */
  selectAll: string;
  /** Accessible name of each row checkbox. */
  selectRow: string;
  /** Accessible name of the filters panel. */
  filters: string;
  /** The empty choice of `select` filters and the summary of an empty `multiselect`. */
  filterAll: string;
  /** Suffix naming the first input of a range filter. */
  filterFrom: string;
  /** Suffix naming the second input of a range filter. */
  filterTo: string;
  /** Text next to the `notEmpty` checkbox. */
  filterNotEmpty: string;
  /** `multiselect` summary for several choices; `{count}` is how many. */
  multiSelected: string;
  /** Accessible name of the search box inside a `multiselect`. */
  searchOptions: string;
  /** Shown in a `multiselect` list when no option matches its search. */
  noOptions: string;
};

/** The default English labels. */
export const DEFAULT_LABELS: BTTableLabels = {
  loading: 'Loading…',
  error: 'Something went wrong.',
  search: 'Search',
  clearSearch: 'Clear search',
  counter: 'Showing {from}–{to} of {total}',
  counterFiltered: '(filtered from {total})',
  noRecords: 'No records',
  exportCsv: 'CSV',
  pagination: 'Pagination',
  previousPage: 'Previous',
  nextPage: 'Next',
  page: 'Page',
  pageOf: 'of {count}',
  pageSize: 'Rows per page',
  selectAll: 'Select all',
  selectRow: 'Select row',
  filters: 'Filters',
  filterAll: 'All',
  filterFrom: 'from',
  filterTo: 'to',
  filterNotEmpty: 'Only non-empty',
  multiSelected: '{count} selected',
  searchOptions: 'Search options',
  noOptions: 'No options',
};

const COUNT_FORMAT = new Intl.NumberFormat();

/** A count with the runtime locale's digit grouping, e.g. `2,345`. */
export function formatCount(count: number): string {
  return COUNT_FORMAT.format(count);
}

/** Replaces each `{name}` in `template` with `values[name]`; unknown names stay as written. */
export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
