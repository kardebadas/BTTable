import { formatIsoDay } from './dates';
import type { Column, ExportData } from './types';
import { formatValue, getColumnValue } from './values';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Export/aria label of a column: `headerText`, else a string `header`, else `key`. */
export function headerText<R>(column: Column<R>): string {
  if (column.headerText !== undefined) return column.headerText;
  return typeof column.header === 'string' ? column.header : column.key;
}

function isLocalMidnight(date: Date): boolean {
  return date.getHours() + date.getMinutes() + date.getSeconds() + date.getMilliseconds() === 0;
}

/**
 * One export cell: finite numbers stay numbers; valid dates become `yyyy-mm-dd` at local
 * midnight, else a full ISO timestamp; everything else is `formatValue` text (invalid
 * dates, NaN and plain objects become '').
 */
function exportCell(value: unknown): string | number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return formatValue(value);
  return isLocalMidnight(value) ? formatIsoDay(value) : value.toISOString();
}

/**
 * Headers and cell values for exporting `rows`: each column's `headerText` and
 * `exportValue` (default: the raw value), converted to plain strings or numbers so a
 * CSV, PDF or spreadsheet writer never sees a React node or an invalid date.
 */
export function buildExportData<R>(columns: readonly Column<R>[], rows: readonly R[]): ExportData {
  return {
    headers: columns.map(headerText),
    rows: rows.map((row) =>
      columns.map((column) => exportCell(column.exportValue ? column.exportValue(row) : getColumnValue(column, row))),
    ),
  };
}

function csvField(value: unknown): string {
  const cell = exportCell(value);
  let text = String(cell);
  if (typeof cell === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * RFC 4180 CSV text: every field double-quoted with quotes doubled, comma-separated,
 * records joined by CRLF. Text starting with `= + - @ TAB CR` is prefixed with `'` so
 * spreadsheets do not run it as a formula; numbers are written as is.
 */
export function toCsv(data: { headers: readonly string[]; rows: readonly (readonly unknown[])[] }): string {
  return [data.headers, ...data.rows].map((record) => record.map(csvField).join(',')).join('\r\n');
}
