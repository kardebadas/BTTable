import { type ErrorInfo, type ReactNode, useEffect, useRef } from 'react';
import { cx } from './components/classNames';
import { ColGroup, tableMinWidth, toCssSize } from './components/ColGroup';
import { type ControlProps, FooterControls, type TableControls, TopControls } from './components/Controls';
import { ErrorBoundary } from './components/ErrorBoundary';
import { type RowCallbacks, TableBody } from './components/TableBody';
import { TableHead } from './components/TableHead';
import { buildExportData } from './core/export';
import { getCounter } from './core/pagination';
import type { Column, FetchRows, Query, SortState } from './core/types';
import { ownRowId } from './core/values';
import { shouldVirtualize, type VirtualizeMode } from './core/virtual';
import type { RowEntry, RowId } from './hooks/rowModel';
import { type ClientTable as ClientTableModel, type ClientTableState, useClientTable } from './hooks/useClientTable';
import { type ServerTable as ServerTableModel, useServerTable } from './hooks/useServerTable';
import { useVirtualRows } from './hooks/useVirtualRows';
import { type BTTableLabels, DEFAULT_LABELS } from './labels';

/** Props of `BTTable`. Pass exactly one of `rows` (client mode) or `fetchRows` (server mode). */
export type BTTableProps<R> = RowCallbacks<R> &
  ControlProps & {
  /**
   * Should be stable (memoized): a new array re-derives and re-renders every row, and
   * scrolls the table back to the top, on every parent render.
   */
  columns: readonly Column<R>[];
  /** Should be stable (memoized): a new array is new data, so the table scrolls back to the top on every parent render. */
  rows?: readonly R[];
  /**
   * Server mode data source, called for each page. A new function identity does not
   * refetch: change `refreshKey` to refetch (e.g. when the fetcher captures a tenant id).
   */
  fetchRows?: FetchRows<R>;
  /**
   * Default: `row.id ?? row.ID ?? row.INDEX ?? row.N_ID`, else the index. Selection needs
   * stable ids; in server mode the index is the position within the page, so ids collide
   * across pages: server rows need real ids. Should be stable (memoized): a new function
   * re-derives every row and scrolls the table back to the top on every parent render.
   */
  getRowId?: (row: R, index: number) => RowId;
  /** Client mode only: `false` shows every filtered row. Server mode always paginates (development warning). */
  pagination?: boolean;
  pageSize?: number;
  searchDebounceMs?: number;
  /** Changing it clears search and filters and goes back to page 1, keeping sort and page size. */
  resetKey?: unknown;
  /** Server mode: changing it sends the current query again. */
  refreshKey?: unknown;
  /** Server mode: called with each query sent to `fetchRows` (for URL sync etc.). */
  onQueryChange?: (query: Query) => void;
  onStateChange?: (state: ClientTableState<R>) => void;
  /**
   * Checkbox column. In server mode select-all covers the current page, and selected ids
   * are never pruned (rows on other pages are not loaded): clear stale ids through a
   * controlled `selectedIds`.
   */
  selectable?: boolean;
  selectedIds?: readonly RowId[];
  defaultSelectedIds?: readonly RowId[];
  onSelectionChange?: (ids: RowId[]) => void;
  /** Number px or CSS size; `'none'` turns the inner vertical scroll and virtualization off. Default 600. */
  maxHeight?: number | string;
  /** Mount only the rows near the viewport: `'auto'` (default) above `virtualizeThreshold` rows, `true`, `false`. */
  virtualize?: VirtualizeMode;
  /** Row count above which `virtualize: 'auto'` turns on. Default 100. */
  virtualizeThreshold?: number;
  /** Px assumed for a row until it is measured; real heights replace it. Default 40. */
  estimatedRowHeight?: number;
  loading?: boolean;
  emptyMessage?: ReactNode;
  /** Visually hidden table caption, for assistive technology. */
  caption?: ReactNode;
  className?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
  labels?: Partial<BTTableLabels>;
};

type ContentProps<R> = BTTableProps<R> & { labels: BTTableLabels };

type ViewProps<R> = ContentProps<R> & {
  entries: readonly RowEntry<R>[];
  sort: SortState;
  onSort: (key: string) => void;
  /** Toolbar, filters, footer and selection state; without it only the table renders. */
  controls?: TableControls;
};

/** The status strip always keeps one line of height, so loading never shifts the table. */
const STATUS_STYLE = { minHeight: '1.5em' } as const;

/**
 * True unless `process.env.NODE_ENV` is `'production'`. Bundlers replace that expression
 * text even where `process` does not exist, so it must be read directly, not behind a
 * `typeof process` guard; without a bundler the read throws and counts as development.
 */
function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

/** Throws when not exactly one of `rows` / `fetchRows` is passed. */
function assertOneSource<R>({ rows, fetchRows }: BTTableProps<R>): void {
  const hasRows = rows !== undefined && rows !== null;
  if (hasRows !== Boolean(fetchRows)) return;
  const got = hasRows ? 'both' : 'neither';
  throw new Error(`BTTable: pass exactly one of \`rows\` or \`fetchRows\` (got ${got}).`);
}

/** Warns once per `rows` change, in development, when invalid rows were skipped. */
function useInvalidRowWarning(rows: readonly unknown[], validCount: number): void {
  const skipped = rows.length - validCount;
  useEffect(() => {
    if (skipped > 0 && isDevelopment()) {
      console.warn(`BTTable: skipped ${skipped} invalid rows (null or not an object).`);
    }
  }, [rows, skipped]);
}

const DEFAULT_ROW_HEIGHT = 40;

/** The `estimatedRowHeight` prop, or the default when it is missing, not finite or not positive. */
function rowEstimate(estimatedRowHeight: number | undefined): number {
  const valid = estimatedRowHeight !== undefined && Number.isFinite(estimatedRowHeight) && estimatedRowHeight > 0;
  return valid ? estimatedRowHeight : DEFAULT_ROW_HEIGHT;
}

/** Virtualization per the `maxHeight` / `virtualize` / `virtualizeThreshold` / `estimatedRowHeight` props. */
function useTableVirtualization<R>(props: ViewProps<R>) {
  const { entries, maxHeight = 600, virtualize = 'auto', virtualizeThreshold = 100 } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const enabled = shouldVirtualize({ virtualize, maxHeight, rowCount: entries.length, threshold: virtualizeThreshold });
  const estimatedRowHeight = rowEstimate(props.estimatedRowHeight);
  const range = useVirtualRows({ entries, enabled, estimatedRowHeight, scrollRef });
  return { scrollRef, enabled, range, maxHeight };
}

/** The select-all box and the row checkboxes, when the table is selectable and has selection state. */
function selectionControls<R>({ controls, selectable, labels }: ViewProps<R>) {
  if (!selectable || !controls) return { selectAll: undefined, rowSelection: undefined };
  const { allSelected, indeterminate, toggleAll, isSelected, toggleRow } = controls.selection;
  return {
    selectAll: { checked: allSelected, indeterminate, onToggle: toggleAll, label: labels.selectAll },
    rowSelection: { isSelected, toggleRow, label: labels.selectRow },
  };
}

/** The scroll container and the table: fixed layout, sticky header, rows virtualized when on. */
function TableScroll<R>(props: ViewProps<R>) {
  const { columns, entries, labels, selectable = false, loading = false, emptyMessage = 'No records found' } = props;
  const { scrollRef, enabled, range, maxHeight } = useTableVirtualization(props);
  const { selectAll, rowSelection } = selectionControls(props);
  // Collapsed borders: no border-spacing between rows, so rows sit exactly at their measured offsets.
  const tableStyle = { tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%', minWidth: tableMinWidth(columns, selectable) } as const;
  // A stable gutter keeps the vertical scrollbar from taking width from the columns when it appears.
  // Virtualization keeps the view anchored itself, so the browser's scroll anchoring must not also adjust it.
  const scrollStyle = { overflow: 'auto', scrollbarGutter: 'stable', maxHeight: toCssSize(maxHeight), overflowAnchor: enabled ? 'none' : undefined } as const;
  const bodyFallback = (
    <tbody>
      <tr>
        <td className="btt-error" role="alert" colSpan={columns.length + (selectable ? 1 : 0)}>
          {labels.error}
        </td>
      </tr>
    </tbody>
  );
  return (
    <div className="btt-scroll" style={scrollStyle} ref={scrollRef}>
      <table className="btt-table" style={tableStyle} aria-busy={loading} aria-rowcount={entries.length + 1}>
        {props.caption !== undefined && <caption className="btt-caption">{props.caption}</caption>}
        <ColGroup columns={columns} selectable={selectable} />
        <TableHead columns={columns} sort={props.sort} onSort={props.onSort} selectable={selectable} selectAll={selectAll} />
        <ErrorBoundary fallback={bodyFallback} onError={props.onError} resetKey={entries}>
          <TableBody
            entries={entries}
            columns={columns}
            selectable={selectable}
            loading={loading}
            emptyMessage={emptyMessage}
            range={range}
            selection={rowSelection}
            rowClassName={props.rowClassName}
            rowProps={props.rowProps}
          />
        </ErrorBoundary>
      </table>
    </div>
  );
}

function TableView<R>(props: ViewProps<R>) {
  const { controls } = props;
  const loading = props.loading ?? false;
  return (
    <>
      {controls && <TopControls {...props} controls={controls} />}
      <div className={cx('btt-status', loading && 'btt-status--loading')} style={STATUS_STYLE} role="status" aria-live="polite">
        {loading ? props.labels.loading : null}
      </div>
      <TableScroll {...props} />
      {controls && <FooterControls {...props} controls={controls} />}
    </>
  );
}

/** Controls of client mode: the counter over the filtered rows, and every filtered row for export. */
function clientControls<R>(table: ClientTableModel<R>, props: ContentProps<R>): TableControls {
  const counter = getCounter({
    page: table.page,
    pageSize: props.pagination === false ? 0 : table.pageSize,
    total: table.filteredRows.length,
    unfilteredTotal: table.totalRows,
  });
  const exportData = () => buildExportData(props.columns, table.filteredRows.map((entry) => entry.row));
  return { ...table, counter, exportData };
}

function ClientTable<R>(props: ContentProps<R> & { rows: readonly R[] }) {
  const table = useClientTable(props);
  useInvalidRowWarning(props.rows, table.totalRows);
  const controls = clientControls(table, props);
  return <TableView {...props} entries={table.pageRows} sort={table.sort} onSort={table.toggleSort} controls={controls} />;
}

/** The body row of a failed server request: the error text and a Retry button. */
function LoadError({ labels, onRetry }: { labels: BTTableLabels; onRetry: () => void }) {
  return (
    <span className="btt-error" role="alert">
      {labels.loadError}{' '}
      <button type="button" className="btt-retry" onClick={onRetry}>
        {labels.retry}
      </button>
    </span>
  );
}

/**
 * Controls of server mode. Export (CSV and `onExport`) covers the rows of the current page
 * only: the other pages live on the server.
 */
function serverControls<R>(table: ServerTableModel<R>, props: ContentProps<R>): TableControls {
  const exportData = () => buildExportData(props.columns, table.pageRows.map((entry) => entry.row));
  return { ...table, exportData };
}

/** Logs `message` once per mount, in development, the first time `condition` holds. */
function useWarnOnce(condition: boolean, message: string): void {
  const warned = useRef(false);
  useEffect(() => {
    if (!condition || warned.current || !isDevelopment()) return;
    warned.current = true;
    console.warn(message);
  }, [condition, message]);
}

/** Development warnings of server mode: ignored `pagination={false}` and selectable rows without ids. */
function useServerWarnings<R>(props: ContentProps<R>, pageRows: readonly RowEntry<R>[]): void {
  useWarnOnce(props.pagination === false, 'BTTable: pagination={false} is ignored in server mode; pages always come from fetchRows.');
  const missingIds = Boolean(props.selectable) && !props.getRowId && pageRows.some((entry) => ownRowId(entry.row) === undefined);
  useWarnOnce(
    missingIds,
    'BTTable: selectable server rows need ids: give rows an id/ID/INDEX/N_ID field or pass getRowId, or selections collide across pages.',
  );
}

function ServerTable<R>(props: ContentProps<R> & { fetchRows: FetchRows<R> }) {
  const table = useServerTable(props);
  useServerWarnings(props, table.pageRows);
  const loading = Boolean(props.loading) || table.loading;
  const emptyMessage = table.error ? <LoadError labels={props.labels} onRetry={table.retry} /> : props.emptyMessage;
  const view = { entries: table.pageRows, loading, emptyMessage, sort: table.sort, onSort: table.toggleSort, pagination: true };
  return <TableView {...props} {...view} controls={serverControls(table, props)} />;
}

/** Validates the mode, then renders client mode (`rows`) or server mode (`fetchRows`). */
function TableContent<R>(props: ContentProps<R>) {
  assertOneSource(props);
  if (props.rows) return <ClientTable {...props} rows={props.rows} />;
  return <ServerTable {...props} fetchRows={props.fetchRows as FetchRows<R>} />;
}

/**
 * Fixed-layout data table. Column widths come only from `columns` (a `<colgroup>` under
 * `table-layout: fixed`), so headers never move with the mounted rows; the `<thead>` is
 * sticky inside one scroll container. Render errors show a fallback and call `onError`;
 * passing both or neither of `rows` / `fetchRows` is such an error.
 */
export function BTTable<R>(props: BTTableProps<R>) {
  const labels = { ...DEFAULT_LABELS, ...props.labels };
  const fallback = (
    <div className="btt-error" role="alert">
      {labels.error}
    </div>
  );
  return (
    <div className={cx('btt', props.className)}>
      <ErrorBoundary fallback={fallback} onError={props.onError} resetKey={props.rows ?? props.fetchRows}>
        <TableContent {...props} labels={labels} />
      </ErrorBoundary>
    </div>
  );
}
