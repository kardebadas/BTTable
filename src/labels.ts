/**
 * Every UI string of the table, in English by default; `labels` overrides any of them.
 * `{name}` placeholders are filled in by the table.
 */
export type BTTableLabels = {
  /** Status strip text while `loading`. */
  loading: string;
  /** Fallback text after a render error. */
  error: string;
  /** Server mode: error row text when `fetchRows` rejects. */
  loadError: string;
  /** Server mode: the error row's button that sends the request again. */
  retry: string;
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
  /** Server and manual mode: what the counter's help button explains. */
  counterHelp: string;
  /** Accessible name of the counter's help button. */
  counterHelpButton: string;
  /** Text of the toolbar button that clears search and every filter. */
  clearAll: string;
  /** Text of the CSV export button. */
  exportCsv: string;
  /** Text of each `exportFormats` button; `{format}` is the format name in upper case. */
  exportFormat: string;
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

/** The default English labels (frozen: spread them to build your own). */
export const DEFAULT_LABELS: Readonly<BTTableLabels> = Object.freeze({
  loading: 'Loading…',
  error: 'Something went wrong.',
  loadError: 'Could not load the rows.',
  retry: 'Retry',
  search: 'Search',
  clearSearch: 'Clear search',
  counter: 'Showing {from}–{to} of {total}',
  counterFiltered: '(filtered from {total})',
  noRecords: 'No records',
  counterHelp: 'Search and filters run on the whole dataset; one page is shown at a time.',
  counterHelpButton: 'About the counter',
  clearAll: 'Clear all',
  exportCsv: 'CSV',
  exportFormat: '{format}',
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
});

const COUNT_FORMATS = new Map<string | undefined, Intl.NumberFormat>();

/**
 * A count with the digit grouping of `locale` (default: the runtime's), e.g. `2,345`.
 * One formatter per locale is created and kept.
 */
export function formatCount(count: number, locale?: string): string {
  let format = COUNT_FORMATS.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale);
    COUNT_FORMATS.set(locale, format);
  }
  return format.format(count);
}

/** Replaces each `{name}` in `template` with `values[name]`; unknown names stay as written. */
export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
