import { compareValues, type Column, type ExportQuery, type FetchResult, type FilterState, type Query } from '../src';
import { filterRows } from '../src/core/filters';

/** Simulated network latency of every request, in ms. */
export const LATENCY_MS = 300;

/** Input of `fakeFetch`. */
export type FakeFetchInput<R> = {
  rows: readonly R[];
  columns: readonly Column<R>[];
  query: Query;
  signal: AbortSignal;
  /** Reject this request with a server error. */
  fail?: boolean;
};

function sortRows<R>(rows: R[], sort: Query['sort']): R[] {
  if (!sort) return rows;
  const read = (row: R) => (row as Record<string, unknown>)[sort.key];
  return [...rows].sort((a, b) => compareValues(read(a), read(b), sort.direction));
}

/** What a real server does in SQL: search, filter, sort, then cut out one page. */
function runQuery<R>({ rows, columns, query }: FakeFetchInput<R>): FetchResult<R> {
  const filters: FilterState = {};
  for (const [key, filter] of Object.entries(query.filters)) filters[key] = filter.value as FilterState[string];
  const matched = sortRows(filterRows({ rows, columns, search: query.search, filters }), query.sort);
  const start = (query.page - 1) * query.pageSize;
  return { rows: matched.slice(start, start + query.pageSize), totalRows: rows.length, totalFilteredRows: matched.length };
}

/**
 * An in-memory `fetchRows` backend: answers after `LATENCY_MS`, honours the query and the
 * abort signal (rejecting with an `AbortError`), and fails on demand.
 */
export function fakeFetch<R>(input: FakeFetchInput<R>): Promise<FetchResult<R>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (input.fail) reject(new Error('Simulated server failure'));
      else resolve(runQuery(input));
    }, LATENCY_MS);
    input.signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Request aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** An in-memory `fetchAllRows` backend: every row matching the query, after `LATENCY_MS`. */
export function fakeFetchAll<R>(input: Omit<FakeFetchInput<R>, 'query'> & { query: ExportQuery }): Promise<R[]> {
  const query = { ...input.query, page: 1, pageSize: Number.MAX_SAFE_INTEGER };
  return fakeFetch({ ...input, query }).then((result) => result.rows);
}
