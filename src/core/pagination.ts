/** Number of pages for `totalRows`; at least 1, and no empty page after a full last page. */
export function pageCount(totalRows: number, pageSize: number): number {
  const size = Number(pageSize);
  const total = Number(totalRows);
  if (!(size > 0) || !Number.isFinite(total)) return 1;
  return Math.max(1, Math.ceil(total / size));
}

/** A 1-based page coerced to an integer and clamped into `1..pageCount(totalRows, pageSize)`. */
export function clampPage(page: number, totalRows: number, pageSize: number): number {
  const last = pageCount(totalRows, pageSize);
  return Math.min(Math.max(1, Math.floor(Number(page)) || 1), last);
}

/**
 * The rows of a 1-based `page`, clamped into range. Page and size are coerced to
 * numbers, so a string size from a `<select>` can never concatenate. A non-positive size
 * returns every row.
 */
export function paginate<R>(rows: readonly R[], page: number, pageSize: number): R[] {
  const size = Number(pageSize);
  if (!(size > 0)) return rows.slice();
  const start = (clampPage(page, rows.length, size) - 1) * size;
  return rows.slice(start, start + size);
}

/** Input of `getCounter`. `pageRowCount` is used only when `total` is missing or invalid. */
export type CounterInput = {
  page: number;
  pageSize: number;
  total: number;
  unfilteredTotal?: number;
  pageRowCount?: number;
};

/** Counter data: "Showing {from}–{to} of {total}" plus "(filtered from {filteredFrom})". */
export type CounterData = { from: number; to: number; total: number; filteredFrom?: number };

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** The filtered total, or the rows counted up to the end of this page when it is invalid. */
function resolveTotal({ total, page, pageSize, pageRowCount }: CounterInput): number {
  if (isCount(total)) return total;
  const size = Number(pageSize) > 0 ? Number(pageSize) : 0;
  return (Math.max(1, Math.floor(Number(page)) || 1) - 1) * size + (pageRowCount ?? 0);
}

function visibleRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  const size = Number(pageSize);
  if (!(size > 0)) return { from: 1, to: total };
  const current = clampPage(page, total, size);
  return { from: (current - 1) * size + 1, to: Math.min(current * size, total) };
}

/**
 * Counter data for the toolbar, or `null` when there are no records (never "1 to 0").
 * An invalid `total` is counted from the rows on this page instead; `filteredFrom` is
 * set only when a valid `unfilteredTotal` exceeds the total.
 */
export function getCounter(input: CounterInput): CounterData | null {
  const total = resolveTotal(input);
  if (total === 0) return null;
  const counter: CounterData = { ...visibleRange(input.page, input.pageSize, total), total };
  if (isCount(input.unfilteredTotal) && input.unfilteredTotal > total) counter.filteredFrom = input.unfilteredTotal;
  return counter;
}
