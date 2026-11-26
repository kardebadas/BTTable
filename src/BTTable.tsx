import { forwardRef, type ReactElement, type Ref, type RefAttributes, useRef } from 'react';
import { cx } from './components/classNames';
import { ColGroup, tableMinWidth, toCssSize } from './components/ColGroup';
import { FooterControls, type TableControls, TopControls } from './components/Controls';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TableBody } from './components/TableBody';
import { TableHead } from './components/TableHead';
import { buildExportData } from './core/export';
import { getCounter } from './core/pagination';
import type { FetchRows, Query, SortState } from './core/types';
import { ownRowId } from './core/values';
import { shouldVirtualize } from './core/virtual';
import type { RowEntry, RowId, RowSource } from './hooks/rowModel';
import { type ClientTable as ClientTableModel, useClientTable } from './hooks/useClientTable';
import { useManualTable } from './hooks/useManualTable';
import type { PagedTable } from './hooks/usePagedTable';
import { useServerTable } from './hooks/useServerTable';
import { type RowLifecycle, useRowLifecycle } from './hooks/useRowLifecycle';
import { useRowWarnings, useWarnOnce } from './hooks/useRowWarnings';
import { type BTTableHandle, useTableHandle } from './hooks/useTableHandle';
import { useVirtualRows } from './hooks/useVirtualRows';
import type { BTTableAnyProps, BTTableProps } from './BTTableProps';
import { type BTTableLabels, DEFAULT_LABELS } from './labels';

type ContentProps<R> = BTTableAnyProps<R> & { labels: BTTableLabels; handleRef?: Ref<BTTableHandle> };

type ViewProps<R> = ContentProps<R> & {
  entries: readonly RowEntry<R>[];
  /** Identity of the view on screen; a change scrolls back to the top. */
  viewKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  /** Toolbar, filters, footer and selection state; without it only the table renders. */
  controls?: TableControls<R>;
  /** Client mode: the page showing a row, null when it is filtered out. */
  findPage?: (id: RowId) => number | null;
};

/** The status strip always keeps one line of height, so loading never shifts the table. */
const STATUS_STYLE = { minHeight: '1.5em' } as const;

/** Throws unless manual mode has `rows` and `onQueryChange` and no `fetchRows`. */
function assertManual<R>({ rows, fetchRows, onQueryChange }: BTTableAnyProps<R>): void {
  if (rows !== undefined && rows !== null && !fetchRows && typeof onQueryChange === 'function') return;
  throw new Error('BTTable: mode="manual" needs `rows` and `onQueryChange`, and no `fetchRows`.');
}

/** Throws when the props pick no valid mode: not exactly one of `rows` / `fetchRows`, or a bad manual mode. */
function assertOneSource<R>(props: BTTableAnyProps<R>): void {
  if (props.mode === 'manual') return assertManual(props);
  const { rows, fetchRows } = props;
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
  const virtual = useVirtualRows({ entries, viewKey, enabled, estimatedRowHeight, scrollRef });
  return { scrollRef, enabled, virtual, maxHeight };
}

type ScrollParts<R> = ReturnType<typeof useTableVirtualization<R>> & { lifecycle: RowLifecycle<R> };

/** The `ref` handle of the table, over the scroll area, the rows on screen and the controls. */
function useScrollHandle<R>(props: ViewProps<R>, { scrollRef, enabled, virtual, maxHeight, lifecycle }: ScrollParts<R>): void {
  const { controls } = props;
  const noop = () => {};
  useTableHandle(props.handleRef, {
    scrollRef,
    pageScroll: maxHeight === 'none',
    entries: props.entries,
    viewKey: props.viewKey,
    columns: props.columns,
    selectable: Boolean(props.selectable),
    elements: lifecycle.elements,
    virtual: { enabled, offsets: virtual.offsets, jumpTo: virtual.jumpTo },
    page: controls?.page ?? 1,
    setPage: controls?.setPage ?? noop,
    findPage: props.findPage,
    clearSelection: controls?.selection.clear ?? noop,
    resetView: controls?.resetView ?? noop,
  });
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

const MAX_SKELETON_ROWS = 8;

/** Skeleton rows while the first rows load: the page size, at most 8. */
function skeletonCount(pageSize: number | undefined): number {
  if (pageSize === undefined || !(pageSize > 0)) return MAX_SKELETON_ROWS;
  return Math.min(Math.floor(pageSize), MAX_SKELETON_ROWS);
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
  const scroll = useTableVirtualization(props);
  const { scrollRef, enabled, maxHeight } = scroll;
  const lifecycle = useRowLifecycle(props);
  useScrollHandle(props, { ...scroll, lifecycle });
  const { selectAll, rowSelection } = selectionControls(props);
  const headerRows = showTableHeader ? 1 : 0;
  // Collapsed borders: no border-spacing between rows, so rows sit exactly at their measured offsets.
  const tableStyle = { tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%', minWidth: tableMinWidth(columns, selectable) } as const;
  // A stable gutter keeps the vertical scrollbar from taking width from the columns when it appears.
  // Virtualization keeps the view anchored itself, so the browser's scroll anchoring must not also adjust it.
  const scrollStyle = { overflow: 'auto', scrollbarGutter: 'stable', maxHeight: toCssSize(maxHeight), overflowAnchor: enabled ? 'none' : undefined } as const;
  const head = { columns, sort: props.sort, onSort: props.onSort, selectable, selectAll, className: props.theadClassName };
  const skeletonRows = skeletonCount(props.controls?.pageSize);
  const body = { entries, columns, selectable, loading, emptyMessage, range: scroll.virtual.range, selection: rowSelection, headerRows, skeletonRows, lifecycle };
  return (
    <div className="btt-scroll" style={scrollStyle} ref={scrollRef}>
      <table className={cx('btt-table', props.tableClassName)} style={tableStyle} aria-busy={loading} aria-rowcount={entries.length + headerRows}>
        {props.caption !== undefined && <caption className="btt-caption">{props.caption}</caption>}
        <ColGroup columns={columns} selectable={selectable} />
        {showTableHeader && <TableHead {...head} />}
        <ErrorBoundary fallback={bodyFallback(props)} onError={props.onError} resetKey={entries}>
          <TableBody {...body} className={props.tbodyClassName} rowClassName={props.rowClassName} rowProps={props.rowProps} rowTone={props.rowTone} />
        </ErrorBoundary>
      </table>
    </div>
  );
}

/** The `renderSelectionBar` bar, while the table is selectable and at least one row is selected. */
function SelectionBar<R>({ controls, selectable, renderSelectionBar }: ViewProps<R>) {
  if (!controls || !selectable || !renderSelectionBar) return null;
  const { selectedIds, selectedRows, clear } = controls.selection;
  if (selectedIds.length === 0) return null;
  return <div className="btt-selection-bar">{renderSelectionBar({ selectedIds: [...selectedIds], selectedRows, clear })}</div>;
}

function TableView<R>(props: ViewProps<R>) {
  const { controls } = props;
  const loading = props.loading ?? false;
  return (
    <>
      {controls && <TopControls {...props} controls={controls} />}
      <SelectionBar {...props} />
      <div className={cx('btt-status', loading && 'btt-status--loading')} style={STATUS_STYLE} role="status" aria-live="polite">
        {loading ? props.labels.loading : null}
      </div>
      <TableScroll {...props} />
      {controls && <FooterControls {...props} controls={controls} />}
    </>
  );
}

/** Controls of client mode: the counter over the filtered rows, and every filtered row for export. */
function clientControls<R>(table: ClientTableModel<R>, props: ContentProps<R>): TableControls<R> {
  const counter = getCounter({
    page: table.page,
    pageSize: props.pagination === false ? 0 : table.pageSize,
    total: table.filteredRows.length,
    unfilteredTotal: table.totalRows,
  });
  const exportData = () => buildExportData(props.columns, table.filteredRows.map((entry) => entry.row));
  return { ...table, counter, exportData, exportRowCount: table.filteredRows.length };
}

/** The page of a filtered row in client mode (1 without pagination); null when filtered out. */
function clientPageOf<R>(table: ClientTableModel<R>, paginated: boolean, id: RowId): number | null {
  const index = table.filteredRows.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  return paginated ? Math.floor(index / table.pageSize) + 1 : 1;
}

function ClientTable<R>(props: ContentProps<R> & { rows: RowSource<R> }) {
  const table = useClientTable(props);
  useRowWarnings(props.rows, table.entries, props.getRowId);
  const controls = clientControls(table, props);
  const findPage = (id: RowId) => clientPageOf(table, props.pagination !== false, id);
  const view = { entries: table.pageRows, viewKey: table.viewKey, sort: table.sort, onSort: table.toggleSort, findPage };
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
 * Controls of server and manual mode. Export (CSV and `onExport`) covers the rows of the
 * current page only: the other pages live on the server.
 */
function serverControls<R>(table: PagedTable<R>, props: ContentProps<R>): TableControls<R> {
  const exportData = () => buildExportData(props.columns, table.pageRows.map((entry) => entry.row));
  return { ...table, exportData, exportRowCount: table.pageRows.length, counterHelp: true };
}

/** Development warnings of server and manual mode: ignored `pagination={false}` and selectable rows without ids. */
function useServerWarnings<R>(props: ContentProps<R>, pageRows: readonly RowEntry<R>[]): void {
  const [mode, source] = props.mode === 'manual' ? ['manual', 'the parent'] : ['server', 'fetchRows'];
  useWarnOnce(props.pagination === false, `BTTable: pagination={false} is ignored in ${mode} mode; pages always come from ${source}.`);
  // Rows given as a map take their ids from the keys.
  const isMap = Boolean(props.rows) && !Array.isArray(props.rows);
  const missingIds = Boolean(props.selectable) && !props.getRowId && !isMap && pageRows.some((entry) => ownRowId(entry.row) === undefined);
  useWarnOnce(
    missingIds,
    'BTTable: selectable paged rows need ids: give rows an id/ID/INDEX/N_ID field or pass getRowId, or selections collide across pages.',
  );
}

function ServerTable<R>(props: ContentProps<R> & { fetchRows: FetchRows<R> }) {
  const table = useServerTable(props);
  useServerWarnings(props, table.pageRows);
  useRowWarnings(table.responseRows, table.pageRows, props.getRowId);
  const loading = Boolean(props.loading) || table.loading;
  const emptyMessage = table.error ? <LoadError labels={props.labels} onRetry={table.retry} /> : props.emptyMessage;
  const view = { entries: table.pageRows, viewKey: table.viewKey, loading, emptyMessage, sort: table.sort, onSort: table.toggleSort, pagination: true };
  return <TableView {...props} {...view} controls={serverControls(table, props)} />;
}

type ManualContentProps<R> = ContentProps<R> & { rows: RowSource<R>; onQueryChange: (query: Query) => void };

/** Manual mode: server mode's controls over the page the parent passes; `loading` comes from the parent. */
function ManualTable<R>(props: ManualContentProps<R>) {
  const table = useManualTable(props);
  useServerWarnings(props, table.pageRows);
  useRowWarnings(props.rows, table.pageRows, props.getRowId);
  const view = { entries: table.pageRows, viewKey: table.viewKey, sort: table.sort, onSort: table.toggleSort, pagination: true };
  return <TableView {...props} {...view} controls={serverControls(table, props)} />;
}

/** Validates the mode, then renders manual mode, client mode (`rows`) or server mode (`fetchRows`). */
function TableContent<R>(props: ContentProps<R>) {
  assertOneSource(props);
  if (props.mode === 'manual') return <ManualTable {...(props as ManualContentProps<R>)} />;
  if (props.rows) return <ClientTable {...props} rows={props.rows} />;
  return <ServerTable {...props} fetchRows={props.fetchRows as FetchRows<R>} />;
}

/**
 * Fixed-layout data table. Column widths come only from `columns` (a `<colgroup>` under
 * `table-layout: fixed`), so headers never move with the mounted rows; the `<thead>` is
 * sticky inside one scroll container. Render errors show a fallback and call `onError`;
 * passing both or neither of `rows` / `fetchRows`, or `mode="manual"` without `rows` and
 * `onQueryChange`, is such an error.
 */
function BTTableWithRef<R>(props: BTTableProps<R>, ref: Ref<BTTableHandle>) {
  const labels = { ...DEFAULT_LABELS, ...props.labels };
  const fallback = (
    <div className="btt-error" role="alert">
      {labels.error}
    </div>
  );
  return (
    <div className={cx('btt', props.className)}>
      <ErrorBoundary fallback={fallback} onError={props.onError} resetKey={props.rows ?? props.fetchRows}>
        <TableContent {...props} labels={labels} handleRef={ref} />
      </ErrorBoundary>
    </div>
  );
}

/**
 * The table (see `BTTableWithRef`). `ref` takes a `BTTableHandle`
 * (`useRef<BTTableHandle>(null)`); the cast keeps the row type `R` generic, which
 * `forwardRef` alone would fix to `unknown`.
 */
export const BTTable = forwardRef(BTTableWithRef) as <R>(props: BTTableProps<R> & RefAttributes<BTTableHandle>) => ReactElement;
