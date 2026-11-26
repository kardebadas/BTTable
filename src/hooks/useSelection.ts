import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import type { RowEntry, RowId } from './rowModel';
import { useLatest } from './useLatest';
import { resolveRows, rowsInOrder, useSelectedRows } from './useSelectedRows';

/** Called after every selection change with the ids and the selected rows the table knows. */
export type SelectionChange<R> = (ids: RowId[], rows: R[]) => void;

/** Input of `useSelection`. */
export type SelectionOptions<R = unknown> = {
  /** Ids the select-all box covers: the filtered rows (client) or the current page (server). */
  scopeIds: readonly RowId[];
  /**
   * Ids of the rows currently loaded. When given, a selected id whose row was present and
   * is now gone is pruned; ids whose rows have not arrived yet, and every id while no rows
   * are loaded, are kept.
   */
  presentIds?: ReadonlySet<RowId>;
  /** Controlled selection; `undefined` means uncontrolled. */
  selectedIds?: readonly RowId[];
  /** Initial uncontrolled selection. */
  defaultSelectedIds?: readonly RowId[];
  onSelectionChange?: SelectionChange<R>;
  /** The rows the table can see now (client: every row; server: the page), for `selectedRows`. Default none. */
  entries?: readonly RowEntry<R>[];
  /** The checkbox column is on. Turning it off clears the selection, reported once. Default true. */
  enabled?: boolean;
};

/** Row selection: the selected ids and rows, toggles, and the select-all box state. */
export type Selection<R = unknown> = {
  selectedIds: readonly RowId[];
  /** The selected rows the table knows, in selection order; ids never seen have none. */
  selectedRows: R[];
  /** Unselects every row. */
  clear: () => void;
  isSelected: (id: RowId) => boolean;
  toggleRow: (id: RowId) => void;
  toggleAll: () => void;
  allSelected: boolean;
  indeterminate: boolean;
};

type Ref<T> = { current: T };

type PruneInput = {
  source: readonly RowId[];
  presentIds?: ReadonlySet<RowId>;
  controlled: boolean;
  setInternal: Dispatch<SetStateAction<readonly RowId[]>>;
};

/**
 * Drops selected ids whose rows vanished between two non-empty row sets, adjusting state
 * during render; returns the last pruned list (or `null`) for the notifying effect.
 */
function usePruneVanished({ source, presentIds, controlled, setInternal }: PruneInput): readonly RowId[] | null {
  const [previous, setPrevious] = useState(presentIds);
  const [pruned, setPruned] = useState<readonly RowId[] | null>(null);
  if (presentIds === previous || !presentIds || presentIds.size === 0) return pruned;
  setPrevious(presentIds);
  const vanished = (id: RowId) => previous !== undefined && previous.has(id) && !presentIds.has(id);
  if (!source.some(vanished)) return pruned;
  const next = source.filter((id) => !vanished(id));
  if (!controlled) setInternal(next);
  setPruned(next);
  return next;
}

/** Next selection for the select-all box: clear the scope when all of it is selected, else add it. */
function toggleAllIds(selected: readonly RowId[], scopeIds: readonly RowId[]): RowId[] {
  const selectedSet = new Set(selected);
  const all = scopeIds.length > 0 && scopeIds.every((id) => selectedSet.has(id));
  if (!all) return Array.from(new Set([...selected, ...scopeIds]));
  const scope = new Set(scopeIds);
  return selected.filter((id) => !scope.has(id));
}

/** Reports a selection to `onSelectionChange`, with the rows the table knows for it. */
type Report = (ids: readonly RowId[]) => void;

type ActionsInput = {
  controlled: boolean;
  setInternal: Dispatch<SetStateAction<readonly RowId[]>>;
  report: Report;
  latestRef: Ref<readonly RowId[]>;
  scopeRef: Ref<readonly RowId[]>;
};

/** Stable toggles built from the latest selection, so consecutive calls in one handler compose. */
function useSelectionActions({ controlled, setInternal, report, latestRef, scopeRef }: ActionsInput) {
  return useMemo(() => {
    const commit = (next: RowId[]) => {
      latestRef.current = next;
      if (!controlled) setInternal(next);
      report(next);
    };
    const toggleRow = (id: RowId) => {
      const current = latestRef.current;
      commit(current.includes(id) ? current.filter((other) => other !== id) : [...current, id]);
    };
    const toggleAll = () => commit(toggleAllIds(latestRef.current, scopeRef.current));
    const clear = () => commit([]);
    return { toggleRow, toggleAll, clear };
  }, [controlled, setInternal, report, latestRef, scopeRef]);
}

type DisableInput = Omit<PruneInput, 'presentIds'> & { enabled: boolean };

/**
 * Empties a non-empty selection when `enabled` turns off, adjusting state during render;
 * returns the emptied list (or `null`) for the notifying effect.
 */
function useClearOnDisable({ enabled, source, controlled, setInternal }: DisableInput): readonly RowId[] | null {
  const [wasEnabled, setWasEnabled] = useState(enabled);
  const [cleared, setCleared] = useState<readonly RowId[] | null>(null);
  if (enabled === wasEnabled) return cleared;
  setWasEnabled(enabled);
  if (enabled || source.length === 0) return cleared;
  if (!controlled) setInternal([]);
  const next: readonly RowId[] = [];
  setCleared(next);
  return next;
}

/** Calls `onSelectionChange` with the rows known in the latest render, so effects and handlers read fresh rows. */
function useReporter<R>(onChange: SelectionChange<R> | undefined, rows: ReturnType<typeof useSelectedRows<R>>): Report {
  const onChangeRef = useLatest(onChange);
  const rowsRef = useLatest(rows);
  return useCallback(
    (ids: readonly RowId[]) => {
      const { known, cache } = rowsRef.current;
      onChangeRef.current?.([...ids], rowsInOrder(ids, resolveRows(ids, known, cache)));
    },
    [onChangeRef, rowsRef],
  );
}

/** Reports `ids` after commit each time a new list arrives. */
function useNotify(ids: readonly RowId[] | null, report: Report): void {
  useEffect(() => {
    if (ids) report(ids);
  }, [ids, report]);
}

/** The selected and select-all state of the ids in `source` against `scopeIds`. */
function useSelectionView<R>(source: readonly RowId[], scopeIds: readonly RowId[], cache: ReadonlyMap<RowId, R>) {
  const selectedSet = useMemo(() => new Set(source), [source]);
  return useMemo(() => {
    const allSelected = scopeIds.length > 0 && scopeIds.every((id) => selectedSet.has(id));
    const indeterminate = !allSelected && scopeIds.some((id) => selectedSet.has(id));
    const isSelected = (id: RowId) => selectedSet.has(id);
    return { selectedIds: source, selectedRows: rowsInOrder(source, cache), isSelected, allSelected, indeterminate };
  }, [source, scopeIds, selectedSet, cache]);
}

const NO_ENTRIES: never[] = [];

/**
 * Controlled or uncontrolled row selection. `toggleAll` selects every id in scope (or
 * clears them when all are selected) and keeps selections outside it. Vanished ids are
 * pruned (see `presentIds`), and turning `enabled` off clears the selection; both are
 * reported through `onSelectionChange`. The returned object and its actions keep their
 * identity until the selection, scope or known rows change.
 */
export function useSelection<R = unknown>(options: SelectionOptions<R>): Selection<R> {
  const { scopeIds, presentIds, selectedIds } = options;
  const [internal, setInternal] = useState<readonly RowId[]>(() => options.defaultSelectedIds ?? []);
  const controlled = selectedIds !== undefined;
  const source = selectedIds ?? internal;
  const pruned = usePruneVanished({ source, presentIds, controlled, setInternal });
  const cleared = useClearOnDisable({ enabled: options.enabled ?? true, source, controlled, setInternal });
  const rows = useSelectedRows(source, options.entries ?? NO_ENTRIES);
  const report = useReporter(options.onSelectionChange, rows);
  useNotify(pruned, report);
  useNotify(cleared, report);
  const latestRef = useLatest(source);
  const scopeRef = useLatest(scopeIds);
  const actions = useSelectionActions({ controlled, setInternal, report, latestRef, scopeRef });
  const view = useSelectionView(source, scopeIds, rows.cache);
  return useMemo(() => ({ ...view, ...actions }), [view, actions]);
}
