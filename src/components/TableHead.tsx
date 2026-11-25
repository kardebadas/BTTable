import { type ChangeEvent, type CSSProperties, useRef } from 'react';
import { headerText } from '../core/export';
import type { Column, SortState } from '../core/types';
import { useBrowserLayoutEffect } from '../hooks/useBrowserLayoutEffect';
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

/** State of the header "select all" checkbox. */
export type SelectAllState = { checked: boolean; indeterminate: boolean; onToggle: () => void; label: string };

/**
 * The header checkbox. `indeterminate` is a DOM property only, so it is synced after every
 * render, and restored right after a click (which clears it natively) in case the owner
 * of a controlled selection rejects the change and nothing re-renders.
 */
function SelectAllBox({ checked, indeterminate, onToggle, label }: SelectAllState) {
  const ref = useRef<HTMLInputElement>(null);
  useBrowserLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  });
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    event.currentTarget.indeterminate = indeterminate;
    onToggle();
  };
  return <input ref={ref} type="checkbox" className="btt-select" aria-label={label} checked={checked} onChange={change} />;
}

/** Props of `TableHead`. */
export type TableHeadProps<R> = {
  columns: readonly Column<R>[];
  sort: SortState;
  onSort: (key: string) => void;
  selectable: boolean;
  /** The select-all checkbox of the selection column; without it the slot stays empty. */
  selectAll?: SelectAllState;
  /** Extra class on the `<thead>`. */
  className?: string;
};

/**
 * The sticky `<thead>`: one `<th aria-sort>` per column holding a sort `<button>`
 * (click or Enter cycles asc → desc → none), or the bare header when `sortable` is false.
 * When `selectable`, the first header cell holds the select-all checkbox.
 */
export function TableHead<R>({ columns, sort, onSort, selectable, selectAll, className }: TableHeadProps<R>) {
  return (
    <thead className={cx('btt-thead', className)} style={STICKY}>
      <tr aria-rowindex={1}>
        {selectable && (
          <th scope="col" className="btt-th btt-th--select">
            {selectAll && <SelectAllBox {...selectAll} />}
          </th>
        )}
        {columns.map((column) => (
          <HeaderCell key={column.key} column={column} sort={sort} onSort={onSort} />
        ))}
      </tr>
    </thead>
  );
}
