import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import type { RowId } from './rowModel';
import { useLatest } from './useLatest';

/** Input of `useSelection`. */
export type SelectionOptions = {
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
  onSelectionChange?: (ids: RowId[]) => void;
};

/** Row selection: the selected ids, toggles, and the select-all box state. */
export type Selection = {
  selectedIds: readonly RowId[];
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

type ActionsInput = {
  controlled: boolean;
  setInternal: Dispatch<SetStateAction<readonly RowId[]>>;
  onChangeRef: Ref<SelectionOptions['onSelectionChange']>;
  latestRef: Ref<readonly RowId[]>;
  scopeRef: Ref<readonly RowId[]>;
};

/** Stable toggles built from the latest selection, so consecutive calls in one handler compose. */
function useSelectionActions({ controlled, setInternal, onChangeRef, latestRef, scopeRef }: ActionsInput) {
  return useMemo(() => {
    const commit = (next: RowId[]) => {
      latestRef.current = next;
      if (!controlled) setInternal(next);
      onChangeRef.current?.(next);
    };
    const toggleRow = (id: RowId) => {
      const current = latestRef.current;
      commit(current.includes(id) ? current.filter((other) => other !== id) : [...current, id]);
    };
    const toggleAll = () => commit(toggleAllIds(latestRef.current, scopeRef.current));
    return { toggleRow, toggleAll };
  }, [controlled, setInternal, onChangeRef, latestRef, scopeRef]);
}

/**
 * Controlled or uncontrolled row selection. `toggleAll` selects every id in scope (or
 * clears them when all are selected) and keeps selections outside it. Vanished ids are
 * pruned (see `presentIds`) and the drop is reported through `onSelectionChange`. The
 * returned object and its toggles keep their identity until the selection or scope changes.
 */
export function useSelection(options: SelectionOptions): Selection {
  const { scopeIds, presentIds, selectedIds } = options;
  const [internal, setInternal] = useState<readonly RowId[]>(() => options.defaultSelectedIds ?? []);
  const controlled = selectedIds !== undefined;
  const source = selectedIds ?? internal;
  const pruned = usePruneVanished({ source, presentIds, controlled, setInternal });
  const onChange = useLatest(options.onSelectionChange);
  useEffect(() => {
    if (pruned) onChange.current?.([...pruned]);
  }, [pruned, onChange]);

  const latest = useLatest(source);
  const scope = useLatest(scopeIds);
  const { toggleRow, toggleAll } = useSelectionActions({
    controlled,
    setInternal,
    onChangeRef: onChange,
    latestRef: latest,
    scopeRef: scope,
  });
  const selectedSet = useMemo(() => new Set(source), [source]);
  return useMemo(() => {
    const allSelected = scopeIds.length > 0 && scopeIds.every((id) => selectedSet.has(id));
    const indeterminate = !allSelected && scopeIds.some((id) => selectedSet.has(id));
    const isSelected = (id: RowId) => selectedSet.has(id);
    return { selectedIds: source, isSelected, toggleRow, toggleAll, allSelected, indeterminate };
  }, [source, scopeIds, selectedSet, toggleRow, toggleAll]);
}
