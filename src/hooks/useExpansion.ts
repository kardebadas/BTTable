import type { ReactNode } from 'react';
import type { DetailContext } from '../components/TableBody';
import type { RowId } from './rowModel';
import { useSelection } from './useSelection';

/** The detail row props: which rows are expanded, controlled or not. */
export type ExpansionProps<R> = {
  /**
   * Detail content of an expanded row, shown in a row under it spanning every column; turns
   * on the leading toggle column. Should be stable (memoized): rows are memoized on its identity.
   */
  renderDetail?: (ctx: DetailContext<R>) => ReactNode;
  /** Controlled expanded row ids; `undefined` means uncontrolled. */
  expandedIds?: readonly RowId[];
  /** Initial uncontrolled expanded row ids. */
  defaultExpandedIds?: readonly RowId[];
  /** Called after every change of the expanded ids (toggles, pruning, `renderDetail` removed). */
  onExpandedChange?: (ids: RowId[]) => void;
};

/** The expanded rows and their toggle. */
export type Expansion = { expandedIds: readonly RowId[]; isExpanded: (id: RowId) => boolean; toggleRow: (id: RowId) => void };

const NO_SCOPE: RowId[] = [];

/**
 * Expanded detail rows, kept like the selection: several open at once, controlled
 * (`expandedIds`) or not, ids of rows that vanish pruned under the selection rules
 * (`presentIds`: client mode only), and cleared when `renderDetail` goes away. Built on
 * `useSelection`, so the toggle is stable and consecutive toggles compose.
 */
export function useExpansion<R>(props: ExpansionProps<R>, presentIds?: ReadonlySet<RowId>): Expansion {
  const { onExpandedChange } = props;
  const state = useSelection({
    scopeIds: NO_SCOPE,
    presentIds,
    selectedIds: props.expandedIds,
    defaultSelectedIds: props.defaultExpandedIds,
    onSelectionChange: onExpandedChange && ((ids) => onExpandedChange(ids)),
    enabled: Boolean(props.renderDetail),
  });
  return { expandedIds: state.selectedIds, isExpanded: state.isSelected, toggleRow: state.toggleRow };
}
