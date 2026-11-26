import { type ComponentType, Fragment, isValidElement, type ReactNode, type TdHTMLAttributes } from 'react';
import type { CellContext, Column } from '../core/types';
import { formatValue, getColumnValue } from '../core/values';
import type { RowEntry } from '../hooks/rowModel';
import { alignClass, cx } from './classNames';

/** True for an array holding at least one React element. */
function isNodeArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.some((item) => isValidElement(item));
}

/** An array of nodes as a fragment keyed by position: elements as they are, other items as text. */
function nodeList(items: readonly unknown[]): ReactNode {
  return items.map((item, position) => <Fragment key={position}>{isValidElement(item) ? item : formatValue(item)}</Fragment>);
}

/** A copy of `props` without `key` and `ref`, which are not props and must not be spread into JSX. */
function withoutKeyAndRef(props: object | undefined): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...props };
  delete copy.key;
  delete copy.ref;
  return copy;
}

/** The column's `cell` component with `cellProps` under the context props (the context wins). */
function componentContent<R>(Component: ComponentType<CellContext<R>>, ctx: CellContext<R>): ReactNode {
  const { cellProps } = ctx.column;
  const extra = typeof cellProps === 'function' ? cellProps(ctx.row) : cellProps;
  return <Component {...withoutKeyAndRef(extra)} {...ctx} />;
}

/** Cell content: `cell`, else `render`, else the raw value (an element, an array of nodes) or its text. */
function cellContent<R>(ctx: CellContext<R>): ReactNode {
  if (ctx.column.cell) return componentContent(ctx.column.cell, ctx);
  if (ctx.column.render) return ctx.column.render(ctx);
  if (isValidElement(ctx.value)) return ctx.value;
  if (isNodeArray(ctx.value)) return nodeList(ctx.value);
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

function cellClass<R>(column: Column<R>, row: R): string | undefined {
  if (typeof column.cellClassName === 'function') return column.cellClassName(row);
  return column.cellClassName;
}

/** One body cell: content, classes and the column's cell handlers. */
export function Cell<R>({ column, entry }: { column: Column<R>; entry: RowEntry<R> }) {
  const ctx: CellContext<R> = { row: entry.row, value: getColumnValue(column, entry.row), rowIndex: entry.index, rowId: entry.id, column };
  return (
    <td className={cx('btt-cell', alignClass(column.align), cellClass(column, entry.row))} {...cellHandlers(ctx)}>
      {cellContent(ctx)}
    </td>
  );
}
