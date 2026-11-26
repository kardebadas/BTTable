import type { Column } from '../core/types';

const DEFAULT_MIN_WIDTH = 60;

/** Width in px of the selection checkbox column. */
export const SELECT_COLUMN_WIDTH = 40;

/** Width in px of the detail toggle column (`renderDetail`). */
export const EXPAND_COLUMN_WIDTH = 40;

/** The leading columns before the data columns: the detail toggle and the selection checkbox. */
export type LeadingColumns = { selectable: boolean; expandable?: boolean };

/** How many leading columns come before the data columns. */
export function leadingCount({ selectable, expandable = false }: LeadingColumns): number {
  return (selectable ? 1 : 0) + (expandable ? 1 : 0);
}

/** A CSS size: numbers are px, strings pass through as given, `undefined` stays unset. */
export function toCssSize(size: number | string | undefined): string | undefined {
  return typeof size === 'number' ? `${size}px` : size;
}

/**
 * The table's min-width in px: each column's numeric `width`, else its `minWidth`
 * (default 60), plus the leading columns. Depends on the columns only, never on rows.
 */
export function tableMinWidth<R>(columns: readonly Column<R>[], selectable: boolean, expandable = false): number {
  let total = (selectable ? SELECT_COLUMN_WIDTH : 0) + (expandable ? EXPAND_COLUMN_WIDTH : 0);
  for (const column of columns) {
    total += typeof column.width === 'number' ? column.width : (column.minWidth ?? DEFAULT_MIN_WIDTH);
  }
  return total;
}

/** Props of `ColGroup`. */
export type ColGroupProps<R> = LeadingColumns & { columns: readonly Column<R>[] };

/**
 * The `<colgroup>` that fixes every column width: a pure function of the columns, so the
 * mounted rows can never move a header. A column without `width` gets an unstyled `<col>`
 * and an equal share of the remaining space under `table-layout: fixed`. The detail toggle
 * and selection columns come first, at fixed widths.
 */
export function ColGroup<R>({ columns, selectable, expandable = false }: ColGroupProps<R>) {
  return (
    <colgroup>
      {expandable && <col className="btt-col-expand" style={{ width: EXPAND_COLUMN_WIDTH }} />}
      {selectable && <col className="btt-col-select" style={{ width: SELECT_COLUMN_WIDTH }} />}
      {columns.map((column) => {
        const width = toCssSize(column.width);
        return <col key={column.key} className={column.colClassName} style={width === undefined ? undefined : { width }} />;
      })}
    </colgroup>
  );
}
