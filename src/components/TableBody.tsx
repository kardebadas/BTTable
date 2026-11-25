import { type HTMLAttributes, isValidElement, memo, type ReactNode, type TdHTMLAttributes } from 'react';
import type { CellContext, Column } from '../core/types';
import type { VirtualWindow } from '../core/virtual';
import { formatValue, getColumnValue } from '../core/values';
import type { RowEntry, RowId } from '../hooks/rowModel';
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

function cellContent<R>(ctx: CellContext<R>): ReactNode {
  if (ctx.column.render) return ctx.column.render(ctx);
  if (isValidElement(ctx.value)) return ctx.value;
  return formatValue(ctx.value);
}

/** The column's `onCellClick` / `onCellChange` / `onCellBlur`, bound to this cell; none when unset. */
function cellHandlers<R>(ctx: CellContext<R>): TdHTMLAttributes<HTMLTableCellElement> {
  const { onCellClick, onCellChange, onCellBlur } = ctx.column;
  return {
    onClick: onCellClick && ((event) => onCellClick(event, ctx)),
    onChange: onCellChange && ((event) => onCellChange(event, ctx)),
    onBlur: onCellBlur && ((event) => onCellBlur(event, ctx)),
  };
}

/** One body cell: content, classes and the column's cell handlers. */
function Cell<R>({ column, entry }: { column: Column<R>; entry: RowEntry<R> }) {
  const ctx: CellContext<R> = { row: entry.row, value: getColumnValue(column, entry.row), rowIndex: entry.index, rowId: entry.id, column };
  return (
    <td className={cx('btt-cell', alignClass(column.align), cellClass(column, entry.row))} {...cellHandlers(ctx)}>
      {cellContent(ctx)}
    </td>
  );
}

function cellClass<R>(column: Column<R>, row: R): string | undefined {
  if (typeof column.cellClassName === 'function') return column.cellClassName(row);
  return column.cellClassName;
}

/** Row checkboxes of the selection column. */
export type RowSelection = {
  isSelected: (id: RowId) => boolean;
  /** Should be stable: rows are memoized on its identity. */
  toggleRow: (id: RowId) => void;
  /** Accessible name of each row checkbox. */
  label: string;
};

type SelectCellProps = { id: RowId; selected: boolean; onToggle?: (id: RowId) => void; label?: string };

/** The selection cell; it swallows clicks so checking a row never fires the row's own `onClick`. */
function SelectCell({ id, selected, onToggle, label }: SelectCellProps) {
  return (
    <td className="btt-cell btt-cell--select" onClick={(event) => event.stopPropagation()}>
      {onToggle && (
        <input type="checkbox" className="btt-select" aria-label={label} checked={selected} onChange={() => onToggle(id)} />
      )}
    </td>
  );
}

type RowProps<R> = RowCallbacks<R> & {
  entry: RowEntry<R>;
  columns: readonly Column<R>[];
  /** Index in the whole list, 0-based: drives the odd/even class and `aria-rowindex`. */
  position: number;
  /** Rows above the body counted by `aria-rowindex`: 1 with the header row, 0 without. */
  headerRows: number;
  selectable: boolean;
  selected: boolean;
  onToggleRow?: (id: RowId) => void;
  selectRowLabel?: string;
};

function Row<R>({ entry, columns, position, headerRows, selectable, rowClassName, rowProps, ...select }: RowProps<R>) {
  const attributes = rowProps?.(entry.row, entry.index) ?? {};
  const parity = position % 2 === 0 ? 'btt-row--odd' : 'btt-row--even';
  const className = cx('btt-row', parity, rowClassName?.(entry.row, entry.index), attributes.className);
  return (
    <tr {...attributes} className={className} aria-rowindex={position + headerRows + 1}>
      {selectable && <SelectCell id={entry.id} selected={select.selected} onToggle={select.onToggleRow} label={select.selectRowLabel} />}
      {columns.map((column) => (
        <Cell key={column.key} column={column} entry={entry} />
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
  /** The entries to mount, `[start, end)`, and the spacer heights around them. Default: every entry. */
  range?: VirtualWindow;
  /** Row checkboxes of the selection column; without it the cells stay empty. */
  selection?: RowSelection;
  /** Rows above the body counted by `aria-rowindex`. Default 1 (the header row). */
  headerRows?: number;
  /** Extra class on the `<tbody>`. */
  className?: string;
};

/** Stands in for unmounted rows: one cell spanning every column, no widths, hidden from assistive technology. */
function Spacer({ height, colSpan }: { height: number; colSpan: number }) {
  if (height <= 0) return null;
  return (
    <tr className="btt-spacer" aria-hidden="true" style={{ height }}>
      <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
    </tr>
  );
}

/**
 * The `<tbody>`: one memoized row per mounted entry, keyed by row id, between the spacers
 * of `range`, or the empty message (hidden while loading). Driven by a list of
 * `RowEntry`, whatever the data source.
 */
export function TableBody<R>(props: TableBodyProps<R>) {
  const { entries, columns, selectable, loading, emptyMessage, range, selection, headerRows = 1, className, ...callbacks } = props;
  const colSpan = columns.length + (selectable ? 1 : 0);
  if (entries.length === 0) {
    return (
      <tbody className={className}>
        {!loading && (
          <tr className="btt-empty-row">
            <td className="btt-empty" colSpan={colSpan}>
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    );
  }
  const { start = 0, end = entries.length, padTop = 0, padBottom = 0 } = range ?? {};
  return (
    <tbody className={className}>
      <Spacer height={padTop} colSpan={colSpan} />
      {entries.slice(start, end).map((entry, offset) => (
        <MemoRow
          key={entry.id}
          entry={entry}
          columns={columns}
          position={start + offset}
          headerRows={headerRows}
          selectable={selectable}
          selected={selection?.isSelected(entry.id) ?? false}
          onToggleRow={selection?.toggleRow}
          selectRowLabel={selection?.label}
          {...callbacks}
        />
      ))}
      <Spacer height={padBottom} colSpan={colSpan} />
    </tbody>
  );
}
