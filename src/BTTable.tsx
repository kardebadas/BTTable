import { useEffect, useRef } from 'react';
import { cx } from './components/classNames';
import { ColGroup, tableMinWidth, toCssSize } from './components/ColGroup';
import { FooterControls, type TableControls, TopControls } from './components/Controls';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TableBody } from './components/TableBody';
import { TableHead } from './components/TableHead';
import { buildExportData } from './core/export';
import { getCounter } from './core/pagination';
import type { FetchRows, SortState } from './core/types';
import { ownRowId } from './core/values';
import { shouldVirtualize } from './core/virtual';
import type { RowEntry, RowSource } from './hooks/rowModel';
import { type ClientTable as ClientTableModel, useClientTable } from './hooks/useClientTable';
import { type ServerTable as ServerTableModel, useServerTable } from './hooks/useServerTable';
import { isDevelopment, useRowWarnings } from './hooks/useRowWarnings';
import { useVirtualRows } from './hooks/useVirtualRows';
import type { BTTableAnyProps, BTTableProps } from './BTTableProps';
import { type BTTableLabels, DEFAULT_LABELS } from './labels';

type ContentProps<R> = BTTableAnyProps<R> & { labels: BTTableLabels };

type ViewProps<R> = ContentProps<R> & {
  entries: readonly RowEntry<R>[];
  /** Identity of the view on screen; a change scrolls back to the top. */
  viewKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  /** Toolbar, filters, footer and selection state; without it only the table renders. */
  controls?: TableControls;
};

/** The status strip always keeps one line of height, so loading never shifts the table. */
const STATUS_STYLE = { minHeight: '1.5em' } as const;

/** Throws when not exactly one of `rows` / `fetchRows` is passed. */
function assertOneSource<R>({ rows, fetchRows }: BTTableAnyProps<R>): void {
  const hasRows = rows !== undefined && rows !== null;
  if (hasRows !== Boolean(fetchRows)) return;
  const got = hasRows ? 'both' : 'neither';
  throw new Error(`BTTable: pass exactly one of \`rows\` or \`fetchRows\` (got ${got}).`);
}

const DEFAULT_ROW_HEIGHT = 40;

/** The `estimatedRowHeight` prop, or the default when it is missing, not finite or not positive. */
function rowEstimate(estimatedRowHeight: number | undefined): number {
  const valid = estimatedRowHeight !== undefined && Number.isFinite(estimatedRowHeight) && estimatedRowHeight > 0;
  return valid ? estimatedRowHeight : DEFAULT_ROW_HEIGHT;
}

/** Virtualization per the `maxHeight` / `virtualize` / `virtualizeThreshold` / `estimatedRowHeight` props. */
function useTableVirtualization<R>(props: ViewProps<R>) {
  const { entries, viewKey, maxHeight = 600, virtualize = 'auto', virtualizeThreshold = 100 } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const enabled = shouldVirtualize({ virtualize, maxHeight, rowCount: entries.length, threshold: virtualizeThreshold });
  const estimatedRowHeight = rowEstimate(props.estimatedRowHeight);
  const range = useVirtualRows({ entries, viewKey, enabled, estimatedRowHeight, scrollRef });
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

/** The body shown when rendering the rows fails. */
function bodyFallback<R>({ columns, selectable, labels, tbodyClassName }: ViewProps<R>) {
  return (
    <tbody className={tbodyClassName}>
      <tr>
        <td className="btt-error" role="alert" colSpan={columns.length + (selectable ? 1 : 0)}>
          {labels.error}
        </td>
      </tr>
    </tbody>
  );
}

/** The scroll container and the table: fixed layout, sticky header (unless hidden), rows virtualized when on. */
function TableScroll<R>(props: ViewProps<R>) {
  const { columns, entries, selectable = false, loading = false, emptyMessage = 'No records found', showTableHeader = true } = props;
  const { scrollRef, enabled, range, maxHeight } = useTableVirtualization(props);
  const { selectAll, rowSelection } = selectionControls(props);
  const headerRows = showTableHeader ? 1 : 0;
  // Collapsed borders: no border-spacing between rows, so rows sit exactly at their measured offsets.
  const tableStyle = { tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%', minWidth: tableMinWidth(columns, selectable) } as const;
  // A stable gutter keeps the vertical scrollbar from taking width from the columns when it appears.
  // Virtualization keeps the view anchored itself, so the browser's scroll anchoring must not also adjust it.
  const scrollStyle = { overflow: 'auto', scrollbarGutter: 'stable', maxHeight: toCssSize(maxHeight), overflowAnchor: enabled ? 'none' : undefined } as const;
  const head = { columns, sort: props.sort, onSort: props.onSort, selectable, selectAll, className: props.theadClassName };
  const body = { entries, columns, selectable, loading, emptyMessage, range, selection: rowSelection, headerRows };
  return (
    <div className="btt-scroll" style={scrollStyle} ref={scrollRef}>
      <table className={cx('btt-table', props.tableClassName)} style={tableStyle} aria-busy={loading} aria-rowcount={entries.length + headerRows}>
        {props.caption !== undefined && <caption className="btt-caption">{props.caption}</caption>}
        <ColGroup columns={columns} selectable={selectable} />
        {showTableHeader && <TableHead {...head} />}
        <ErrorBoundary fallback={bodyFallback(props)} onError={props.onError} resetKey={entries}>
          <TableBody {...body} className={props.tbodyClassName} rowClassName={props.rowClassName} rowProps={props.rowProps} />
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

function ClientTable<R>(props: ContentProps<R> & { rows: RowSource<R> }) {
  const table = useClientTable(props);
  useRowWarnings(props.rows, table.entries);
  const controls = clientControls(table, props);
  const view = { entries: table.pageRows, viewKey: table.viewKey, sort: table.sort, onSort: table.toggleSort };
  return <TableView {...props} {...view} controls={controls} />;
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
  useRowWarnings(table.responseRows, table.pageRows);
  const loading = Boolean(props.loading) || table.loading;
  const emptyMessage = table.error ? <LoadError labels={props.labels} onRetry={table.retry} /> : props.emptyMessage;
  const view = { entries: table.pageRows, viewKey: table.viewKey, loading, emptyMessage, sort: table.sort, onSort: table.toggleSort, pagination: true };
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
