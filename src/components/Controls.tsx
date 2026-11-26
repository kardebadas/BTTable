import type { ErrorInfo, ReactNode } from 'react';
import { toCsv } from '../core/export';
import { isFilterActive } from '../core/filters';
import type { CounterData } from '../core/pagination';
import type { Column, ExportData, FilterState, FilterValue } from '../core/types';
import { type AllRowsExport, type ExportRunner, useExportRunner } from '../hooks/useExportRunner';
import type { Selection } from '../hooks/useSelection';
import type { BTTableLabels } from '../labels';
import { ErrorBoundary } from './ErrorBoundary';
import { FilterPanel } from './FilterPanel';
import { Pagination } from './Pagination';
import { exportTarget, Toolbar } from './Toolbar';

/** Table props of the toolbar and footer controls. */
export type ControlProps = {
  /** Global search box. Default `true`. */
  search?: boolean;
  /** Default `'Search…'`. */
  searchPlaceholder?: string;
  /** Page sizes offered in the footer; positive whole numbers only. Default `[25, 50, 100, 500]`. */
  pageSizeOptions?: readonly number[];
  /** "Showing 1–100 of 2,345" / "No records" in the toolbar. Default `true`. */
  showCounter?: boolean;
  /**
   * A CSV button that downloads every filtered row (server and manual mode: the rows of the
   * current page, or every filtered row through `fetchAllRows`). Default `false`.
   */
  exportCsv?: boolean;
  /** Default `'table.csv'`. */
  exportFileName?: string;
  /**
   * Called by the `exportFormats` buttons with every filtered row (server and manual mode: the
   * rows of the current page, or every filtered row through `fetchAllRows`), for caller-side
   * PDF or spreadsheet writers.
   */
  onExport?: (format: string, data: ExportData) => void;
  /** Extra export format names, one toolbar button each, calling `onExport`. Default `[]`. */
  exportFormats?: readonly string[];
  /** A "Clear all" button, shown while search or any filter is active, that clears both. Default `true`. */
  clearAll?: boolean;
  /** Caller content placed in the toolbar. */
  toolbarExtras?: ReactNode;
  /**
   * Locale of the counter and page-count numbers (e.g. `'en-US'`). Default: the runtime's;
   * pass a fixed one when server rendering, so the server and the browser agree.
   */
  locale?: string;
  /**
   * Where multi-select filter popovers are portalled, so an `overflow: hidden` ancestor
   * never clips them. Default `document.body`; pass an element inside a modal dialog that
   * traps focus. The popover copies the table's theme, so it renders the same anywhere.
   */
  portalContainer?: HTMLElement | null;
};

/** State and actions the controls read, whatever the data mode. */
export type TableControls<R = unknown> = AllRowsExport & {
  searchInput: string;
  setSearch: (text: string) => void;
  /** Empties the search and applies it at once, skipping any debounce. */
  clearSearch: () => void;
  filters: FilterState;
  setFilter: (key: string, value: FilterValue) => void;
  /** Empties the search and every filter at once, back to page 1. */
  clearAll: () => void;
  /** Search and filters back to their defaults, page 1 (what a new `resetKey` does). */
  resetView: () => void;
  page: number;
  pageCount: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  /** `null` shows "No records"; `undefined` hides the counter. */
  counter: CounterData | null | undefined;
  /** The export payload for every filtered row (server mode: the current page); called on click only. */
  exportData: () => ExportData;
  /** Rows the export would hold; with none the export buttons are disabled. */
  exportRowCount: number;
  /** Shows the counter's help button: search and filters run on the server, one page shows. */
  counterHelp?: boolean;
  selection: Selection<R>;
};

/** Input of `TopControls` and `FooterControls`. */
export type ControlsInput<R> = ControlProps & {
  columns: readonly Column<R>[];
  labels: BTTableLabels;
  controls: TableControls;
  pagination?: boolean;
  /** Disables the export buttons. */
  loading?: boolean;
  onError?: (error: Error, info: ErrorInfo) => void;
};

const DEFAULT_PAGE_SIZES = [25, 50, 100, 500];
// A byte order mark so spreadsheet apps read the file as UTF-8.
const BOM = '\ufeff';

/**
 * Saves CSV text as a file through a temporary object URL and anchor. Touches `document`
 * only when called, so it is safe to import during server rendering.
 */
function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next task: some browsers start reading the URL only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The export button actions: with `exportAll` the rows load first (through `runner`, which
 * also cancels), else the payload is built at once from the rows at hand.
 */
function exportActions<R>(props: ControlsInput<R>, runner: ExportRunner) {
  const { controls, onExport } = props;
  const fileName = props.exportFileName ?? 'table.csv';
  const start = (target: string, deliver: (data: ExportData) => void) => {
    if (controls.exportAll) runner.run(target, deliver);
    else deliver(controls.exportData());
  };
  const csv = () => start(exportTarget(), (data) => downloadCsv(fileName, toCsv(data)));
  return {
    onExportCsv: props.exportCsv ? csv : undefined,
    onExport: onExport && ((format: string) => start(exportTarget(format), (data) => onExport(format, data))),
    exportDisabled: Boolean(props.loading) || controls.exportRowCount === 0,
    exportBusy: runner.busy,
    exportStatus: controls.exportAll ? exportStatus(runner, props.labels) : undefined,
  };
}

/** The export status line: the failure message after a failed every-row export, else empty. */
function exportStatus(runner: ExportRunner, labels: BTTableLabels): string {
  return runner.failed ? labels.exportError : '';
}

/** True while the search box holds text or any column filter is active. */
function isNarrowed<R>({ columns, controls }: ControlsInput<R>): boolean {
  if (controls.searchInput !== '') return true;
  return columns.some((column) => column.filter !== undefined && isFilterActive(column.filter, controls.filters[column.key]));
}

/**
 * The filters panel and the toolbar above the table, each behind an error boundary. Owns the
 * every-row export (`exportAll`): unmounting aborts it.
 */
export function TopControls<R>(props: ControlsInput<R>) {
  const { controls, labels } = props;
  const runner = useExportRunner({ exportAll: controls.exportAll, exportKey: controls.exportKey, onError: props.onError });
  const fallback = <div className="btt-error" role="alert">{labels.error}</div>;
  const search = {
    value: controls.searchInput,
    placeholder: props.searchPlaceholder ?? 'Search…',
    onChange: controls.setSearch,
    onClear: controls.clearSearch,
  };
  return (
    <>
      <ErrorBoundary fallback={fallback} onError={props.onError} resetKey={props.columns}>
        <FilterPanel columns={props.columns} filters={controls.filters} onFilterChange={controls.setFilter} labels={labels} portalContainer={props.portalContainer} />
      </ErrorBoundary>
      <Toolbar
        labels={labels}
        locale={props.locale}
        search={props.search === false ? undefined : search}
        counter={props.showCounter === false ? undefined : controls.counter}
        counterHelp={controls.counterHelp}
        exportFormats={props.exportFormats}
        extras={props.toolbarExtras}
        onClearAll={props.clearAll !== false && isNarrowed(props) ? controls.clearAll : undefined}
        {...exportActions(props, runner)}
      />
    </>
  );
}

/** The pagination footer below the table, behind an error boundary; nothing when `pagination` is `false`. */
export function FooterControls<R>({ controls, labels, locale, pagination, pageSizeOptions, onError }: ControlsInput<R>) {
  if (pagination === false) return null;
  const fallback = <div className="btt-error" role="alert">{labels.error}</div>;
  return (
    <ErrorBoundary fallback={fallback} onError={onError} resetKey={labels}>
      <Pagination
        labels={labels}
        locale={locale}
        page={controls.page}
        pageCount={controls.pageCount}
        pageSize={controls.pageSize}
        pageSizeOptions={pageSizeOptions ?? DEFAULT_PAGE_SIZES}
        onPageChange={controls.setPage}
        onPageSizeChange={controls.setPageSize}
      />
    </ErrorBoundary>
  );
}
