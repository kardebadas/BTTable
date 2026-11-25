import { useEffect, useMemo } from 'react';
import { type RowEntry, type RowSource, sourceSize } from './rowModel';

/**
 * True unless `process.env.NODE_ENV` is `'production'`. Bundlers replace that expression
 * text even where `process` does not exist, so it must be read directly, not behind a
 * `typeof process` guard; without a bundler the read throws and counts as development.
 */
export function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

/** How many entries share their id with an earlier entry. */
function duplicateIdCount<R>(entries: readonly RowEntry<R>[]): number {
  return entries.length - new Set(entries.map((entry) => entry.id)).size;
}

/**
 * Development warnings about a row source (the `rows` prop, array or map, or one server response): rows
 * skipped as invalid (null or not an object) and rows whose id repeats an earlier one.
 * Each warns once per change of `rows`, not on every render.
 */
export function useRowWarnings<R>(rows: RowSource<unknown>, entries: readonly RowEntry<R>[]): void {
  const skipped = sourceSize(rows) - entries.length;
  const duplicates = useMemo(() => duplicateIdCount(entries), [entries]);
  useEffect(() => {
    if (!isDevelopment()) return;
    if (skipped > 0) console.warn(`BTTable: skipped ${skipped} invalid rows (null or not an object).`);
    if (duplicates > 0) {
      console.warn(`BTTable: ${duplicates} row(s) repeat the id of an earlier row; give every row a unique id (or pass getRowId).`);
    }
  }, [rows, skipped, duplicates]);
}
