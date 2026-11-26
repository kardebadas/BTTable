import type { Column } from '../core/types';

const DEFAULT_MIN_WIDTH = 60;

/** Width in px of the selection checkbox column. */
export const SELECT_COLUMN_WIDTH = 40;

/** A CSS size: numbers are px, strings pass through as given, `undefined` stays unset. */
export function toCssSize(size: number | string | undefined): string | undefined {
  return typeof size === 'number' ? `${size}px` : size;
}

/**
 * The table's min-width in px: each column's numeric `width`, else its `minWidth`
 * (default 60), plus the selection column. Depends on the columns only, never on rows.
 */
export function tableMinWidth<R>(columns: readonly Column<R>[], selectable: boolean): number {
  let total = selectable ? SELECT_COLUMN_WIDTH : 0;
  for (const column of columns) {
    total += typeof column.width === 'number' ? column.width : (column.minWidth ?? DEFAULT_MIN_WIDTH);
  }
  return total;
}

/** Props of `ColGroup`. */
export type ColGroupProps<R> = { columns: readonly Column<R>[]; selectable: boolean };

/**
 * The `<colgroup>` that fixes every column width: a pure function of the columns, so the
 * mounted rows can never move a header. A column without `width` gets an unstyled `<col>`
 * and an equal share of the remaining space under `table-layout: fixed`.
 */
export function ColGroup<R>({ columns, selectable }: ColGroupProps<R>) {
  return (
    <colgroup>
      {selectable && <col className="btt-col-select" style={{ width: SELECT_COLUMN_WIDTH }} />}
      {columns.map((column) => {
        const width = toCssSize(column.width);
        return <col key={column.key} className={column.colClassName} style={width === undefined ? undefined : { width }} />;
      })}
    </colgroup>
  );
}
