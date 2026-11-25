import type { CSSProperties } from 'react';
import { headerText } from '../core/export';
import type { Column, SortState } from '../core/types';
import { alignClass, cx } from './classNames';

const STICKY: CSSProperties = { position: 'sticky', top: 0, zIndex: 1 };

type AriaSort = 'ascending' | 'descending' | 'none';

function ariaSort(key: string, sort: SortState): AriaSort {
  if (sort?.key !== key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

/** Up and down carets; the stylesheet highlights one from the header's `aria-sort`. */
function SortCaret() {
  return (
    <svg className="btt-sort-icon" viewBox="0 0 8 12" width="8" height="12" aria-hidden="true" focusable="false">
      <path className="btt-caret-up" d="M4 0l4 5H0z" />
      <path className="btt-caret-down" d="M4 12l4-5H0z" />
    </svg>
  );
}

type HeaderCellProps<R> = { column: Column<R>; sort: SortState; onSort: (key: string) => void };

/** Accessible name for a node header (`headerText`, else the key); a string header names itself. */
function ariaLabel<R>(column: Column<R>): string | undefined {
  return typeof column.header === 'string' ? undefined : headerText(column);
}

function HeaderCell<R>({ column, sort, onSort }: HeaderCellProps<R>) {
  const className = cx('btt-th', alignClass(column.align), column.headerClassName);
  if (column.sortable === false) {
    return (
      <th scope="col" className={className} aria-label={ariaLabel(column)}>
        {column.header}
      </th>
    );
  }
  return (
    <th scope="col" className={className} aria-sort={ariaSort(column.key, sort)}>
      <button type="button" className="btt-sort" aria-label={ariaLabel(column)} onClick={() => onSort(column.key)}>
        {column.header}
        <SortCaret />
      </button>
    </th>
  );
}

/** Props of `TableHead`. */
export type TableHeadProps<R> = {
  columns: readonly Column<R>[];
  sort: SortState;
  onSort: (key: string) => void;
  selectable: boolean;
};

/**
 * The sticky `<thead>`: one `<th aria-sort>` per column holding a sort `<button>`
 * (click or Enter cycles asc → desc → none), or the bare header when `sortable` is false.
 * When `selectable`, an empty first header cell is the selection column's slot.
 */
export function TableHead<R>({ columns, sort, onSort, selectable }: TableHeadProps<R>) {
  return (
    <thead className="btt-thead" style={STICKY}>
      <tr aria-rowindex={1}>
        {selectable && <th scope="col" className="btt-th btt-th--select" />}
        {columns.map((column) => (
          <HeaderCell key={column.key} column={column} sort={sort} onSort={onSort} />
        ))}
      </tr>
    </thead>
  );
}
