import { type MouseEvent, type ReactNode, useRef } from 'react';
import type { CounterData } from '../core/pagination';
import { type BTTableLabels, fillLabel, formatCount } from '../labels';
import { CounterHelp } from './CounterHelp';

/** The search box state of the `Toolbar`. */
export type ToolbarSearch = {
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
  /** The clear button: should empty the search and apply it at once. */
  onClear: () => void;
};

/** Props of `Toolbar`; every part is optional and is left out when its prop is. */
export type ToolbarProps = {
  labels: BTTableLabels;
  /** Locale of the counter's numbers; default: the runtime's. */
  locale?: string;
  search?: ToolbarSearch;
  /** Counter data; `null` shows "No records", `undefined` hides the counter. */
  counter?: CounterData | null;
  /** A "?" help button next to the counter (server and manual mode). */
  counterHelp?: boolean;
  /** The "Clear all" button: shown only when given. */
  onClearAll?: () => void;
  onExportCsv?: () => void;
  /** Extra export format names, one button each; shown only with `onExport`. */
  exportFormats?: readonly string[];
  onExport?: (format: string) => void;
  /** Disables every export button (nothing to export, or loading). */
  exportDisabled?: boolean;
  extras?: ReactNode;
};

/**
 * Counter text: "Showing 1–100 of 2,345", plus "(filtered from 50,000)", or "No records" for
 * `null`. Numbers use the digit grouping of `locale` (default: the runtime's).
 */
export function formatCounter(counter: CounterData | null, labels: BTTableLabels, locale?: string): string {
  if (!counter) return labels.noRecords;
  const { from, to, total, filteredFrom } = counter;
  const count = (value: number) => formatCount(value, locale);
  const text = fillLabel(labels.counter, { from: count(from), to: count(to), total: count(total) });
  if (filteredFrom === undefined) return text;
  return `${text} ${fillLabel(labels.counterFiltered, { total: count(filteredFrom) })}`;
}

function SearchBox({ value, placeholder, onChange, onClear, labels }: ToolbarSearch & { labels: BTTableLabels }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clear = () => {
    onClear();
    inputRef.current?.focus();
  };
  return (
    <div className="btt-search">
      <input
        ref={inputRef}
        type="text"
        className="btt-search-input"
        aria-label={labels.search}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value !== '' && (
        <button type="button" className="btt-search-clear" aria-label={labels.clearSearch} onClick={clear}>
          ×
        </button>
      )}
    </div>
  );
}

function ExportButtons({ labels, onExportCsv, exportFormats, onExport, exportDisabled = false }: ToolbarProps) {
  const formats = onExport ? (exportFormats ?? []) : [];
  if (!onExportCsv && formats.length === 0) return null;
  return (
    <div className="btt-exports">
      {onExportCsv && (
        <button type="button" className="btt-export btt-export--csv" disabled={exportDisabled} onClick={onExportCsv}>
          {labels.exportCsv}
        </button>
      )}
      {formats.map((format) => (
        <button key={format} type="button" className={`btt-export btt-export--${format}`} disabled={exportDisabled} onClick={() => onExport?.(format)}>
          {fillLabel(labels.exportFormat, { format: format.toUpperCase() })}
        </button>
      ))}
    </div>
  );
}

function hasExports({ onExportCsv, exportFormats, onExport }: ToolbarProps): boolean {
  return Boolean(onExportCsv) || (Boolean(onExport) && (exportFormats ?? []).length > 0);
}

function isEmpty(props: ToolbarProps): boolean {
  const { search, counter, onClearAll, extras } = props;
  const hasExtras = extras !== undefined && extras !== null;
  return !search && !onClearAll && counter === undefined && !hasExports(props) && !hasExtras;
}

/**
 * The "Clear all" button. It disappears once nothing is left to clear, so it moves focus
 * to the search box, else to the toolbar, instead of letting it drop to the page.
 */
function ClearAllButton({ label, onClearAll }: { label: string; onClearAll: () => void }) {
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    const toolbar = event.currentTarget.closest<HTMLElement>('.btt-toolbar');
    onClearAll();
    (toolbar?.querySelector<HTMLElement>('.btt-search-input') ?? toolbar)?.focus();
  };
  return (
    <button type="button" className="btt-clear-all" onClick={click}>
      {label}
    </button>
  );
}

/** The record counter, with its help button when asked for. */
function Counter({ counter, labels, locale, help }: { counter: CounterData | null; labels: BTTableLabels; locale?: string; help: boolean }) {
  const text = <span className="btt-counter">{formatCounter(counter, labels, locale)}</span>;
  if (!help) return text;
  return (
    <span className="btt-counter-group">
      {text}
      <CounterHelp labels={labels} />
    </span>
  );
}

/**
 * The toolbar above the table: search box with a clear button, "Clear all", record counter
 * (with its help button), CSV and extra export buttons, and caller extras. Presentational: state comes in as props and
 * every action goes out through a callback, whatever the data mode.
 */
export function Toolbar(props: ToolbarProps) {
  if (isEmpty(props)) return null;
  const { labels, locale, search, counter, onClearAll, extras } = props;
  return (
    <div className="btt-toolbar" tabIndex={-1}>
      {search && <SearchBox {...search} labels={labels} />}
      {onClearAll && <ClearAllButton label={labels.clearAll} onClearAll={onClearAll} />}
      {counter !== undefined && <Counter counter={counter} labels={labels} locale={locale} help={Boolean(props.counterHelp)} />}
      <ExportButtons {...props} />
      {extras !== undefined && extras !== null && <div className="btt-toolbar-extras">{extras}</div>}
    </div>
  );
}
