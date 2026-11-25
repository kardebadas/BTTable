/** Package version, kept in step with package.json. */
export const VERSION = '0.1.0';

export type {
  CellContext,
  Column,
  DateOp,
  ExportData,
  FetchResult,
  FetchRows,
  FilterSpec,
  FilterState,
  FilterValue,
  NumberOp,
  Option,
  Query,
  SortState,
  TextOp,
} from './core/types';
export { compareValues } from './core/compare';
export { parseDate } from './core/dates';
export { buildExportData, toCsv } from './core/export';
export { formatValue } from './core/values';
export { BTTable, type BTTableProps } from './BTTable';
export type { RowAttributes } from './components/TableBody';
export type { RowId } from './hooks/rowModel';
export type { ClientTableState } from './hooks/useClientTable';
export type { BTTableLabels } from './labels';
