import { formatUsDate } from './dates';
import type { Column } from './types';

const ID_KEYS = ['id', 'ID', 'INDEX', 'N_ID'] as const;

/** The first string or number among `row.id`, `row.ID`, `row.INDEX`, `row.N_ID`; `undefined` when none. */
export function ownRowId(row: unknown): string | number | undefined {
  if (typeof row !== 'object' || row === null) return undefined;
  const record = row as Record<string, unknown>;
  for (const key of ID_KEYS) {
    const id = record[key];
    if (typeof id === 'string' || typeof id === 'number') return id;
  }
  return undefined;
}

/**
 * Default row id: the first string or number among `row.id`, `row.ID`, `row.INDEX`,
 * `row.N_ID`, else the row's index. Selection needs stable ids; the index fallback is
 * positional and changes when rows are reordered or replaced.
 */
export function getRowId(row: unknown, index: number): string | number {
  return ownRowId(row) ?? index;
}

/** The raw value of `column` for `row`: `column.value(row)`, else `row[column.key]`. */
export function getColumnValue<R>(column: Column<R>, row: R): unknown {
  if (column.value) return column.value(row);
  if (typeof row !== 'object' || row === null) return undefined;
  return (row as Record<string, unknown>)[column.key];
}

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * A finite number from a number or a plain decimal string (trimmed, e.g. `-0.5`, `+3`,
 * `.5`, `10.`); `null` otherwise. Exponents, hex, `Infinity` and grouped digits stay text. Shared
 * by sorting and the number filter so both read numeric text the same way.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return DECIMAL.test(text) ? Number(text) : null;
}

/** Concatenated text of React children (strings, numbers, nested elements, arrays). */
function childrenText(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenText).join('');
  return elementText(children);
}

/** Text of a React element, read from its `props.children`; '' for anything else. */
function elementText(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('$$typeof' in value)) return '';
  const props = (value as { props?: { children?: unknown } }).props;
  return childrenText(props?.children);
}

function formatObject(value: object): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : formatUsDate(value);
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(', ');
  return elementText(value);
}

/**
 * Default display text of a raw value: '' for null/undefined/NaN, `Yes`/`No` for
 * booleans, `M/D/YYYY` for dates, comma-joined arrays, the text of React elements, and
 * '' for other objects.
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isNaN(value) ? '' : String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'object') return formatObject(value);
  return '';
}
