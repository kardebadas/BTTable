import type { ReactNode } from 'react';

/** One choice of a `select` or `multiselect` filter. */
export type Option = { value: string; label: ReactNode };

/** Text filter operators; the default is `contains`. */
export type TextOp = 'contains' | 'equals' | 'startsWith' | 'endsWith';

/** Number filter operators; the default is `eq`. `range` takes `[min, max]`, inclusive. */
export type NumberOp = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'range';

/** Date filter operators; the default is `on`. Dates compare as calendar days. */
export type DateOp = 'on' | 'before' | 'after' | 'range';

/** Per-column filter configuration. Dates are ISO `yyyy-mm-dd` strings. */
export type FilterSpec =
  | { type: 'text'; op?: TextOp; placeholder?: string; defaultValue?: string }
  | { type: 'number'; op?: NumberOp; defaultValue?: number | [number | null, number | null] }
  | { type: 'date'; op?: DateOp; defaultValue?: string | [string | null, string | null] }
  | { type: 'select'; options: Option[]; defaultValue?: string }
  | { type: 'multiselect'; options: Option[]; defaultValue?: string[] }
  | { type: 'notEmpty' };

/**
 * The current value of one column filter. Empty values (`''`, `null`, `[]`, an all-null
 * range, `false` for `notEmpty`) mean the filter is inactive.
 */
export type FilterValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly [number | null, number | null]
  | readonly [string | null, string | null]
  | null
  | undefined;

/** Filter values keyed by column key. */
export type FilterState = Record<string, FilterValue>;

/** Active sort, or `null` when unsorted. */
export type SortState = { key: string; direction: 'asc' | 'desc' } | null;

/** What a custom cell `render` receives. */
export type CellContext<R> = { row: R; value: unknown; rowIndex: number; column: Column<R> };

/** One table column. `key` is unique and is also the default accessor (`row[key]`). */
export type Column<R> = {
  key: string;
  header: ReactNode;
  headerText?: string;
  width?: number | string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  value?: (row: R) => unknown;
  render?: (ctx: CellContext<R>) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: R) => unknown;
  searchable?: boolean;
  searchValue?: (row: R) => string;
  exportValue?: (row: R) => unknown;
  filter?: FilterSpec;
  cellClassName?: string | ((row: R) => string | undefined);
  headerClassName?: string;
};

/** Server-mode request built by the table for `fetchRows`. */
export type Query = {
  page: number;
  pageSize: number;
  search: string;
  sort: SortState;
  filters: Record<string, { type: FilterSpec['type']; op?: string; value: unknown }>;
};

/** Server-mode response. `totalFilteredRows` defaults to `totalRows`. */
export type FetchResult<R> = { rows: R[]; totalRows: number; totalFilteredRows?: number };

/** Server-mode data source; must honour `signal` so stale requests can be aborted. */
export type FetchRows<R> = (query: Query, ctx: { signal: AbortSignal }) => Promise<FetchResult<R>>;

/** Export payload: one text header per column and one row of cell values per data row. */
export type ExportData = { headers: string[]; rows: (string | number)[][] };
