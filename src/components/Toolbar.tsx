import { type ReactNode, useRef } from 'react';
import type { CounterData } from '../core/pagination';
import { type BTTableLabels, fillLabel, formatCount } from '../labels';

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
  search?: ToolbarSearch;
  /** Counter data; `null` shows "No records", `undefined` hides the counter. */
  counter?: CounterData | null;
  onExportCsv?: () => void;
  /** Extra export format names, one button each; shown only with `onExport`. */
  exportFormats?: readonly string[];
  onExport?: (format: string) => void;
  extras?: ReactNode;
};

/** Counter text: "Showing 1–100 of 2,345", plus "(filtered from 50,000)", or "No records" for `null`. */
export function formatCounter(counter: CounterData | null, labels: BTTableLabels): string {
  if (!counter) return labels.noRecords;
  const { from, to, total, filteredFrom } = counter;
  const text = fillLabel(labels.counter, { from: formatCount(from), to: formatCount(to), total: formatCount(total) });
  if (filteredFrom === undefined) return text;
  return `${text} ${fillLabel(labels.counterFiltered, { total: formatCount(filteredFrom) })}`;
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

function ExportButtons({ labels, onExportCsv, exportFormats, onExport }: ToolbarProps) {
  const formats = onExport ? (exportFormats ?? []) : [];
  if (!onExportCsv && formats.length === 0) return null;
  return (
    <div className="btt-exports">
      {onExportCsv && (
        <button type="button" className="btt-export btt-export--csv" onClick={onExportCsv}>
          {labels.exportCsv}
        </button>
      )}
      {formats.map((format) => (
        <button key={format} type="button" className={`btt-export btt-export--${format}`} onClick={() => onExport?.(format)}>
          {format.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function isEmpty({ search, counter, onExportCsv, exportFormats, onExport, extras }: ToolbarProps): boolean {
  const hasExports = Boolean(onExportCsv) || (Boolean(onExport) && (exportFormats ?? []).length > 0);
  return !search && counter === undefined && !hasExports && (extras === undefined || extras === null);
}

/**
 * The toolbar above the table: search box with a clear button, record counter, CSV and
 * extra export buttons, and caller extras. Presentational: state comes in as props and
 * every action goes out through a callback, whatever the data mode.
 */
export function Toolbar(props: ToolbarProps) {
  if (isEmpty(props)) return null;
  const { labels, search, counter, extras } = props;
  return (
    <div className="btt-toolbar">
      {search && <SearchBox {...search} labels={labels} />}
      {counter !== undefined && <span className="btt-counter">{formatCounter(counter, labels)}</span>}
      <ExportButtons {...props} />
      {extras !== undefined && extras !== null && <div className="btt-toolbar-extras">{extras}</div>}
    </div>
  );
}
