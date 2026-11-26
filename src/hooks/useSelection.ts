import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import type { RowEntry, RowId } from './rowModel';
import { useLatest } from './useLatest';
import { type RowsOf, useSelectedRows } from './useSelectedRows';

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

/**
 * The id set of selection lists this module built, so the render after a toggle does not
 * build the same set again. Only lists without duplicates are stored.
 */
const knownSets = new WeakMap<readonly RowId[], ReadonlySet<RowId>>();

/** The ids of `list` as a set, reused when `toggleAllIds` already built it. */
function idSet(list: readonly RowId[]): ReadonlySet<RowId> {
  return knownSets.get(list) ?? new Set(list);
}

/**
 * Next selection for the select-all box: clear the scope when all of it is selected, else
 * add it (selected ids first, then the new scope ids, without duplicates). The selected
 * set left by the previous toggle is reused, so each toggle builds one set.
 */
function toggleAllIds(selected: readonly RowId[], scopeIds: readonly RowId[]): RowId[] {
  const selectedSet = idSet(selected);
  const missing = scopeIds.filter((id) => !selectedSet.has(id));
  if (missing.length === 0 && scopeIds.length > 0) {
    const scope = new Set(scopeIds);
    return selected.filter((id) => !scope.has(id));
  }
  const ids = new Set(selected);
  const next = Array.from(ids);
  for (const id of missing) {
    if (ids.has(id)) continue;
    ids.add(id);
    next.push(id);
  }
  knownSets.set(next, ids);
  return next;
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
function useReporter<R>(onChange: SelectionChange<R> | undefined, rowsOf: RowsOf<R>): Report {
  const onChangeRef = useLatest(onChange);
  const rowsRef = useLatest(rowsOf);
  return useCallback(
    (ids: readonly RowId[]) => {
      onChangeRef.current?.([...ids], rowsRef.current(ids));
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

/** Whether every id of a non-empty scope is selected, and whether only some are. No scope pass when nothing is selected. */
function scopeState(selected: ReadonlySet<RowId>, scopeIds: readonly RowId[]) {
  if (selected.size === 0) return { allSelected: false, indeterminate: false };
  const allSelected = scopeIds.length > 0 && scopeIds.every((id) => selected.has(id));
  return { allSelected, indeterminate: !allSelected && scopeIds.some((id) => selected.has(id)) };
}

type View<R> = Pick<Selection<R>, 'selectedIds' | 'selectedRows' | 'isSelected' | 'allSelected' | 'indeterminate'>;

/**
 * The selected and select-all state of the ids in `source` against `scopeIds`.
 * `selectedRows` is resolved on first read, so selecting a million rows does not list them
 * unless someone asks.
 */
function useSelectionView<R>(source: readonly RowId[], scopeIds: readonly RowId[], rowsOf: RowsOf<R>): View<R> {
  const selectedSet = useMemo(() => idSet(source), [source]);
  return useMemo(() => {
    let selectedRows: R[] | null = null;
    return {
      selectedIds: source,
      get selectedRows() {
        selectedRows ??= rowsOf(source);
        return selectedRows;
      },
      isSelected: (id: RowId) => selectedSet.has(id),
      ...scopeState(selectedSet, scopeIds),
    };
  }, [source, scopeIds, selectedSet, rowsOf]);
}

const NO_ENTRIES: never[] = [];

/** `view` with the actions added, keeping its lazy `selectedRows` getter (a spread would read it). */
function withActions<R>(view: View<R>, actions: Pick<Selection<R>, 'clear' | 'toggleRow' | 'toggleAll'>): Selection<R> {
  return Object.defineProperties({ ...actions }, Object.getOwnPropertyDescriptors(view)) as Selection<R>;
}

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
  const view = useSelectionView(source, scopeIds, rows);
  return useMemo(() => withActions(view, actions), [view, actions]);
}
