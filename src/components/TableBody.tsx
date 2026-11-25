import { type HTMLAttributes, isValidElement, memo, type ReactNode } from 'react';
import type { Column } from '../core/types';
import { formatValue, getColumnValue } from '../core/values';
import type { RowEntry } from '../hooks/rowModel';
import { alignClass, cx } from './classNames';

/** Attributes for a body `<tr>`, including `data-*` attributes such as `data-testid`. */
export type RowAttributes = HTMLAttributes<HTMLTableRowElement> & {
  [attribute: `data-${string}`]: string | number | boolean | undefined;
};

/** Row-level callbacks; `index` is the row's index in the `rows` prop. */
export type RowCallbacks<R> = {
  /** Should be stable (memoized): rows are memoized on its identity, so a new function re-renders every row. */
  rowClassName?: (row: R, index: number) => string | undefined;
  /** Should be stable (memoized): rows are memoized on its identity, so a new function re-renders every row. */
  rowProps?: (row: R, index: number) => RowAttributes;
};

function cellContent<R>(column: Column<R>, entry: RowEntry<R>): ReactNode {
  const value = getColumnValue(column, entry.row);
  if (column.render) return column.render({ row: entry.row, value, rowIndex: entry.index, column });
  if (isValidElement(value)) return value;
  return formatValue(value);
}

function cellClass<R>(column: Column<R>, row: R): string | undefined {
  if (typeof column.cellClassName === 'function') return column.cellClassName(row);
  return column.cellClassName;
}

type RowProps<R> = RowCallbacks<R> & {
  entry: RowEntry<R>;
  columns: readonly Column<R>[];
  /** Position on screen, 0-based: drives the odd/even class. */
  position: number;
  selectable: boolean;
};

function Row<R>({ entry, columns, position, selectable, rowClassName, rowProps }: RowProps<R>) {
  const attributes = rowProps?.(entry.row, entry.index) ?? {};
  const parity = position % 2 === 0 ? 'btt-row--odd' : 'btt-row--even';
  const className = cx('btt-row', parity, rowClassName?.(entry.row, entry.index), attributes.className);
  return (
    <tr {...attributes} className={className}>
      {selectable && <td className="btt-cell btt-cell--select" />}
      {columns.map((column) => (
        <td key={column.key} className={cx('btt-cell', alignClass(column.align), cellClass(column, entry.row))}>
          {cellContent(column, entry)}
        </td>
      ))}
    </tr>
  );
}

/** A row re-renders only when its entry, position, columns or callbacks change identity. */
const MemoRow = memo(Row) as typeof Row;

/** Props of `TableBody`. */
export type TableBodyProps<R> = RowCallbacks<R> & {
  entries: readonly RowEntry<R>[];
  columns: readonly Column<R>[];
  selectable: boolean;
  loading: boolean;
  emptyMessage: ReactNode;
};

/**
 * The `<tbody>`: one memoized row per entry, keyed by row id, or the empty message
 * (hidden while loading). Driven by a list of `RowEntry`, whatever the data source.
 */
export function TableBody<R>({ entries, columns, selectable, loading, emptyMessage, ...callbacks }: TableBodyProps<R>) {
  if (entries.length === 0) {
    const colSpan = columns.length + (selectable ? 1 : 0);
    return (
      <tbody>
        {!loading && (
          <tr className="btt-row btt-row--empty">
            <td className="btt-empty" colSpan={colSpan}>
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    );
  }
  return (
    <tbody>
      {entries.map((entry, position) => (
        <MemoRow
          key={entry.id}
          entry={entry}
          columns={columns}
          position={position}
          selectable={selectable}
          {...callbacks}
        />
      ))}
    </tbody>
  );
}
