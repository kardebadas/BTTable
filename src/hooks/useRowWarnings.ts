import { useEffect, useMemo, useRef } from 'react';
import { hasConflictingIds } from '../core/values';
import { type RowEntry, type RowId, type RowSource, sourceSize } from './rowModel';

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

/** Logs `message` once per mount, in development, the first time `condition` holds. */
export function useWarnOnce(condition: boolean, message: string): void {
  const warned = useRef(false);
  useEffect(() => {
    if (!condition || warned.current || !isDevelopment()) return;
    warned.current = true;
    console.warn(message);
  }, [condition, message]);
}

const CONFLICTING_IDS =
  'BTTable: a row has id fields with different values (id, ID, INDEX, N_ID); the first in that order is its id. Pass getRowId to choose.';

/**
 * Development warnings about a row source (the `rows` prop, array or map, or one server response): rows
 * skipped as invalid (null or not an object) and rows whose id repeats an earlier one,
 * each once per change of `rows`, not on every render; and, once per table, a row whose id
 * fields disagree while no `getRowId` picks one.
 */
export function useRowWarnings<R>(rows: RowSource<unknown>, entries: readonly RowEntry<R>[], getRowId?: (row: R, index: number) => RowId): void {
  const conflicting = useMemo(() => !getRowId && isDevelopment() && entries.some((entry) => hasConflictingIds(entry.row)), [entries, getRowId]);
  useWarnOnce(conflicting, CONFLICTING_IDS);
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
