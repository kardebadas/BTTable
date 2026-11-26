/** Package version, kept in step with package.json. */
export const VERSION = '0.1.0';

export type {
  CellContext,
  CellHandler,
  Column,
  DateOp,
  ExportData,
  ExportQuery,
  FetchAllRows,
  FetchResult,
  FetchRows,
  FilterSpec,
  FilterState,
  FilterType,
  FilterValue,
  NumberOp,
  Option,
  Query,
  SortState,
  TextOp,
} from './core/types';
export { compareValues } from './core/compare';
export { filterRows, type FilterRowsInput, isFilterActive, matchesFilter, normalizeFilterType } from './core/filters';
export { buildQuery, type QueryState } from './core/query';
export { matchesSearch } from './core/search';
export { parseDate } from './core/dates';
export { buildExportData, toCsv } from './core/export';
export { formatValue } from './core/values';
export { BTTable } from './BTTable';
export type { BTTableClientProps, BTTableCommonProps, BTTableManualProps, BTTableProps, BTTableServerProps, SelectionBarContext } from './BTTableProps';
export type { DetailContext, RowAttributes, RowCallbacks, RowTone } from './components/TableBody';
export type { ControlProps } from './components/Controls';
export type { BTTableHandle, RowAlign } from './hooks/useTableHandle';
export type { RowLifecycleProps, RowMount, RowUnmount } from './hooks/useRowLifecycle';
export type { ExpansionProps } from './hooks/useExpansion';
export type { SelectionChange } from './hooks/useSelection';
export type { ViewStateCallbacks, ViewStateProps } from './hooks/viewState';
export type { RowId, RowSource } from './hooks/rowModel';
export type { ClientTableState } from './hooks/useClientTable';
export { type BTTableLabels, DEFAULT_LABELS } from './labels';
export type { VirtualizeMode } from './core/virtual';
