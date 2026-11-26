import { type HTMLAttributes, memo, type ReactNode, useRef } from 'react';
import type { Column } from '../core/types';
import type { VirtualWindow } from '../core/virtual';
import type { RowEntry, RowId } from '../hooks/rowModel';
import { type RowLifecycle, useRowEffects } from '../hooks/useRowLifecycle';
import { Cell } from './Cell';
import { cx } from './classNames';
import { leadingCount } from './ColGroup';

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
  /**
   * A tone for the row: class `btt-row--tone-<tone>`, coloured by the `--btt-tone-*`
   * variables. Should be stable (memoized), like `rowClassName`.
   */
  rowTone?: (row: R, index: number) => RowTone | undefined;
};

/** Row tones of `rowTone`. */
export type RowTone = 'danger' | 'warning' | 'success' | 'info';

const TONES: ReadonlySet<string> = new Set<RowTone>(['danger', 'warning', 'success', 'info']);

/** The tone class of a row; none for no tone or an unknown one. */
function toneClass(tone: string | undefined): string | undefined {
  return tone !== undefined && TONES.has(tone) ? `btt-row--tone-${tone}` : undefined;
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

/** What `renderDetail` receives. */
export type DetailContext<R> = { row: R; rowId: RowId };

/** Detail rows (`renderDetail`): the toggle column and the rows shown expanded. */
export type RowExpansion<R> = {
  isExpanded: (id: RowId) => boolean;
  /** Should be stable: rows are memoized on its identity. */
  toggleRow: (id: RowId) => void;
  /** Accessible name of each toggle button. */
  label: string;
  /** Should be stable: rows are memoized on its identity. */
  renderDetail: (ctx: DetailContext<R>) => ReactNode;
  /** Stable, unique per table: prefix of the detail row element ids. */
  idPrefix: string;
};

/** The element id of a row's detail row; the row id is encoded so it never holds a space. */
export function detailRowId(prefix: string, id: RowId): string {
  return `${prefix}-detail-${encodeURIComponent(String(id))}`;
}

type ExpandCellProps = { id: RowId; expanded: boolean; onToggle?: (id: RowId) => void; label?: string; detailId: string };

/**
 * The detail toggle cell: a real button with `aria-expanded`, pointing at the detail row
 * (`aria-controls`) while that row exists. It swallows clicks like the selection cell.
 */
function ExpandCell({ id, expanded, onToggle, label, detailId }: ExpandCellProps) {
  return (
    <td className="btt-cell btt-cell--expand" onClick={(event) => event.stopPropagation()}>
      {onToggle && (
        <button
          type="button"
          className="btt-expand"
          aria-label={label}
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          onClick={() => onToggle(id)}
        >
          <svg className="btt-expand-icon" viewBox="0 0 8 12" width="8" height="12" aria-hidden="true" focusable="false">
            <path d="M1 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      )}
    </td>
  );
}

/** Per-row flags and callbacks of the detail rows, flat so the row memo compares each one. */
type RowDetailProps<R> = {
  expanded: boolean;
  onToggleExpand?: (id: RowId) => void;
  expandLabel?: string;
  renderDetail?: (ctx: DetailContext<R>) => ReactNode;
  detailIdPrefix?: string;
};

type RowProps<R> = RowCallbacks<R> &
  RowDetailProps<R> & {
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
    /** Stable: where the row registers its `<tr>` and reports its mount. */
    lifecycle?: RowLifecycle<R>;
  };

function rowClasses<R>({ entry, position, rowClassName, rowTone }: RowProps<R>, extra: string | undefined): string {
  const parity = position % 2 === 0 ? 'btt-row--odd' : 'btt-row--even';
  return cx('btt-row', parity, toneClass(rowTone?.(entry.row, entry.index)), rowClassName?.(entry.row, entry.index), extra);
}

/** The data row `tr.btt-row`: toggle cell, selection cell, then one cell per column. */
function DataRow<R>(props: RowProps<R> & { detailId: string }) {
  const { entry, columns, position, headerRows, selectable, ...select } = props;
  const rowRef = useRef<HTMLTableRowElement>(null);
  useRowEffects(entry, rowRef, props.lifecycle);
  const attributes = props.rowProps?.(entry.row, entry.index) ?? {};
  return (
    <tr {...attributes} ref={rowRef} className={rowClasses(props, attributes.className)} aria-rowindex={position + headerRows + 1}>
      {props.renderDetail && (
        <ExpandCell id={entry.id} expanded={props.expanded} onToggle={props.onToggleExpand} label={props.expandLabel} detailId={props.detailId} />
      )}
      {selectable && <SelectCell id={entry.id} selected={select.selected} onToggle={select.onToggleRow} label={select.selectRowLabel} />}
      {columns.map((column) => (
        <Cell key={column.key} column={column} entry={entry} />
      ))}
    </tr>
  );
}

/**
 * A data row, followed by its `tr.btt-detail-row` while expanded: one cell spanning every
 * column (toggle and selection columns included). Not a `btt-row`, so it is never counted,
 * striped or selected as data.
 */
function Row<R>(props: RowProps<R>) {
  const { entry, renderDetail } = props;
  const detailId = detailRowId(props.detailIdPrefix ?? '', entry.id);
  const colSpan = props.columns.length + leadingCount({ selectable: props.selectable, expandable: true });
  return (
    <>
      <DataRow {...props} detailId={detailId} />
      {renderDetail && props.expanded && (
        <tr className="btt-detail-row" id={detailId}>
          <td className="btt-detail-cell" colSpan={colSpan}>
            {renderDetail({ row: entry.row, rowId: entry.id })}
          </td>
        </tr>
      )}
    </>
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
  /** Placeholder rows drawn while loading with no rows to show. Default 0. */
  skeletonRows?: number;
  /** Stable: where the rows register their `<tr>` and report their mounts. */
  lifecycle?: RowLifecycle<R>;
  /** Detail rows: a leading toggle column and, under each expanded row, its detail row. */
  expansion?: RowExpansion<R>;
};

/** The detail props of one row, each one compared by the row memo. */
function detailProps<R>(expansion: RowExpansion<R> | undefined, id: RowId): RowDetailProps<R> {
  if (!expansion) return { expanded: false };
  const { isExpanded, toggleRow, label, renderDetail, idPrefix } = expansion;
  return { expanded: isExpanded(id), onToggleExpand: toggleRow, expandLabel: label, renderDetail, detailIdPrefix: idPrefix };
}

/**
 * Placeholder rows while the first rows load: same cells as a data row, so the layout does
 * not jump, but no `btt-row` class and hidden from assistive technology.
 */
function SkeletonRows({ count, colSpan }: { count: number; colSpan: number }) {
  const cells = Array.from({ length: colSpan }, (_, cell) => (
    <td key={cell} className="btt-cell btt-skeleton-cell">
      <span className="btt-skeleton" />
    </td>
  ));
  return Array.from({ length: count }, (_, row) => (
    <tr key={row} className="btt-skeleton-row" aria-hidden="true">
      {cells}
    </tr>
  ));
}

type EmptyBodyProps = { loading: boolean; colSpan: number; skeletonRows: number; emptyMessage: ReactNode; className?: string };

/** The body without rows: skeleton rows while loading, else the empty message. */
function EmptyBody({ loading, colSpan, skeletonRows, emptyMessage, className }: EmptyBodyProps) {
  return (
    <tbody className={className}>
      {loading ? (
        <SkeletonRows count={skeletonRows} colSpan={colSpan} />
      ) : (
        <tr className="btt-empty-row">
          <td className="btt-empty" colSpan={colSpan}>
            {emptyMessage}
          </td>
        </tr>
      )}
    </tbody>
  );
}

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
 * of `range`, or the empty message. An expanded row brings its detail row right after it. Driven by a list of
 * `RowEntry`, whatever the data source. While loading with no rows it draws
 * `skeletonRows` placeholder rows instead of the empty message.
 */
export function TableBody<R>(props: TableBodyProps<R>) {
  const { entries, columns, selectable, loading, emptyMessage, range, selection, headerRows = 1, className, skeletonRows = 0, expansion, ...callbacks } = props;
  const colSpan = columns.length + leadingCount({ selectable, expandable: expansion !== undefined });
  if (entries.length === 0) {
    return <EmptyBody loading={loading} colSpan={colSpan} skeletonRows={skeletonRows} emptyMessage={emptyMessage} className={className} />;
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
          {...detailProps(expansion, entry.id)}
          {...callbacks}
        />
      ))}
      <Spacer height={padBottom} colSpan={colSpan} />
    </tbody>
  );
}
