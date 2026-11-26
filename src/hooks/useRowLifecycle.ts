import { type RefObject, useEffect, useMemo, useRef } from 'react';
import type { RowEntry, RowId } from './rowModel';
import { useBrowserLayoutEffect } from './useBrowserLayoutEffect';
import { useLatest } from './useLatest';

/** Called after a data row mounts: the row, its `<tr>` and its id. */
export type RowMount<R> = (row: R, element: HTMLTableRowElement, rowId: RowId) => void;
/** Called when a data row unmounts, with the row as last rendered. */
export type RowUnmount<R> = (row: R, rowId: RowId) => void;

/** The `onRowMount` / `onRowUnmount` table props. */
export type RowLifecycleProps<R> = {
  /**
   * Called after a data row mounts (in an effect). With virtualization rows mount and
   * unmount as they enter and leave the mounted window; a re-render of a row with the same
   * id does not call it again. Every call is paired with one `onRowUnmount` (StrictMode included).
   */
  onRowMount?: RowMount<R>;
  /** Called when a data row unmounts (the effect cleanup of `onRowMount`). */
  onRowUnmount?: RowUnmount<R>;
};

/**
 * What the body rows report to the table: their `<tr>` (by id, for the imperative handle)
 * and their mounts. Stable for the life of the table, so rows stay memoized.
 */
export type RowLifecycle<R> = {
  /** The mounted data row elements by row id. */
  elements: Map<RowId, HTMLTableRowElement>;
  /** Registers a mounted row element; returns its cleanup. */
  track: (id: RowId, element: HTMLTableRowElement) => () => void;
  /** Calls `onRowMount`; returns the cleanup that calls `onRowUnmount` with the latest row. */
  mount: (entry: RefObject<RowEntry<R>>, element: HTMLTableRowElement) => () => void;
};

/** The table's `RowLifecycle`, calling the latest `onRowMount` / `onRowUnmount`. */
export function useRowLifecycle<R>(props: RowLifecycleProps<R>): RowLifecycle<R> {
  const callbacks = useRef(props);
  // Synced before paint, so rows mounting in this commit already call the new functions.
  useBrowserLayoutEffect(() => {
    callbacks.current = props;
  });
  return useMemo(() => {
    const elements = new Map<RowId, HTMLTableRowElement>();
    const track = (id: RowId, element: HTMLTableRowElement) => {
      elements.set(id, element);
      return () => {
        // With duplicate ids another row may have taken the entry since.
        if (elements.get(id) === element) elements.delete(id);
      };
    };
    const mount = (entry: RefObject<RowEntry<R>>, element: HTMLTableRowElement) => {
      const { row, id } = entry.current;
      callbacks.current.onRowMount?.(row, element, id);
      return () => callbacks.current.onRowUnmount?.(entry.current.row, id);
    };
    return { elements, track, mount };
  }, [callbacks]);
}

/**
 * Inside a body row: registers its `<tr>` before paint (layout effect) and reports its
 * mount and unmount (passive effect). Both depend on the row id only, so new data for the
 * same row re-fires nothing.
 */
export function useRowEffects<R>(entry: RowEntry<R>, rowRef: RefObject<HTMLTableRowElement | null>, lifecycle?: RowLifecycle<R>): void {
  const latest = useLatest(entry);
  const { id } = entry;
  useBrowserLayoutEffect(() => {
    if (lifecycle && rowRef.current) return lifecycle.track(id, rowRef.current);
  }, [lifecycle, id, rowRef]);
  useEffect(() => {
    if (lifecycle && rowRef.current) return lifecycle.mount(latest, rowRef.current);
  }, [lifecycle, id, rowRef, latest]);
}
