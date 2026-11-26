import { type ErrorInfo, useCallback, useEffect, useRef, useState } from 'react';
import { buildExportData } from '../core/export';
import type { Column, ExportData, ExportQuery, FetchAllRows, Query } from '../core/types';
import { useLatest } from './useLatest';

/** A query without its paging: what `fetchAllRows` receives. */
export function exportQueryOf({ search, sort, filters }: Query): ExportQuery {
  return { search, sort, filters };
}

/** The every-row export of server and manual mode: the payload loader and its identity. */
export type AllRowsExport = {
  /** Loads every filtered row through `fetchAllRows` and turns it into the export payload. */
  exportAll?: (signal: AbortSignal) => Promise<ExportData>;
  /** Identity of what `exportAll` loads; a change aborts an export in flight. */
  exportKey?: string;
};

/** The `exportAll` / `exportKey` controls for `query`, or none without `fetchAllRows`. */
export function allRowsExport<R>(query: Query, columns: readonly Column<R>[], fetchAllRows?: FetchAllRows<R>): AllRowsExport {
  if (!fetchAllRows) return {};
  const exportQuery = exportQueryOf(query);
  const exportAll = (signal: AbortSignal) =>
    new Promise<R[]>((resolve) => resolve(fetchAllRows(exportQuery, { signal }))).then((rows) => {
      if (!Array.isArray(rows)) throw new TypeError('BTTable: fetchAllRows must resolve to an array of rows.');
      return buildExportData(columns, rows);
    });
  return { exportAll, exportKey: JSON.stringify(exportQuery) };
}

/** Input of `useExportRunner`. */
export type ExportRunnerInput = AllRowsExport & { onError?: (error: Error, info: ErrorInfo) => void };

/** The state of an every-row export and its start / cancel action. */
export type ExportRunner = {
  /** The export button (`exportTarget`) whose rows are loading, or null. */
  busy: string | null;
  /** The last export failed (until the next one starts). */
  failed: boolean;
  /** Starts loading the rows for `target`, then hands the payload to `deliver`; while one runs, cancels it instead. */
  run: (target: string, deliver: (data: ExportData) => void) => void;
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Runs `exportAll` one export at a time. A second click cancels (aborts) the running export;
 * so do a new `exportKey` (the rows would be stale) and unmounting. An aborted or stale
 * result is never delivered; a failure, of the load or of `deliver` (e.g. a throwing
 * `onExport`), goes to `onError` and sets `failed`.
 */
export function useExportRunner({ exportAll, exportKey, onError }: ExportRunnerInput): ExportRunner {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const running = useRef<AbortController | null>(null);
  const onErrorRef = useLatest(onError);
  const cancel = useCallback(() => {
    running.current?.abort();
    running.current = null;
    setBusy(null);
  }, []);
  useEffect(() => cancel, [exportKey, cancel]);
  const run = (target: string, deliver: (data: ExportData) => void) => {
    if (running.current) return cancel();
    if (!exportAll) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(target);
    setFailed(false);
    const settle = (ok: boolean) => {
      running.current = null;
      setBusy(null);
      setFailed(!ok);
    };
    exportAll(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        settle(true);
        deliver(data);
      })
      // Catches a failed load and a throwing `deliver` alike; an aborted export reports nothing.
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        settle(false);
        onErrorRef.current?.(toError(error), { componentStack: '' });
      });
  };
  return { busy, failed, run };
}
