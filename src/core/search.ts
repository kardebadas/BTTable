import { formatIsoDay, formatUsDate, parseDate } from './dates';
import type { Column } from './types';
import { formatValue, getColumnValue } from './values';

/**
 * Default searchable text of a raw value: its display text, plus `M/D/YYYY` and ISO
 * forms when the value is a date or a date string.
 */
export function searchText(value: unknown): string {
  const text = formatValue(value);
  const date = parseDate(value);
  if (!date) return text;
  return [text, formatUsDate(date), formatIsoDay(date)].join('\n');
}

function columnSearchText<R>(column: Column<R>, row: R): string {
  if (column.searchValue) return column.searchValue(row);
  return searchText(getColumnValue(column, row));
}

/**
 * True when the trimmed `term` is a case-insensitive substring of any searchable
 * column's `searchValue` (default: `searchText` of the raw value). A blank term matches
 * every row. Header content does not matter: node and empty headers are searchable.
 */
export function matchesSearch<R>(row: R, columns: readonly Column<R>[], term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === '') return true;
  return columns.some(
    (column) => column.searchable !== false && columnSearchText(column, row).toLowerCase().includes(needle),
  );
}
