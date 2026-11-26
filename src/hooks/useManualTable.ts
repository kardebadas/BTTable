import { useEffect, useRef, useState } from 'react';
import type { Query } from '../core/types';
import { sourceSize } from './rowModel';
import { clampToTotal, filteredTotal, type PagedQuery, type PagedTable, type PagedTableOptions, type PageResult, usePagedQuery, usePageModel } from './usePagedTable';
import { useRequestSchedule } from './useRequestSchedule';

/** Input of `useManualTable`: the manual-mode subset of the table props. */
export type UseManualTableOptions<R> = PagedTableOptions<R> &
  PageResult<R> & {
    /** Called with each query the parent should load; the parent then passes the page as props. */
    onQueryChange: (query: Query) => void;
    loading?: boolean;
  };

/** Identity of one emitted query: the query and its generation (refresh, reset). */
function requestKeyOf(keys: PagedQuery<unknown>['keys']): string {
  return `${keys.generation}:${keys.queryKey}`;
}

/**
 * Emits the query on the server-mode schedule (once at mount, typing debounced, the rest at
 * once). A request already emitted is not emitted again, so StrictMode's double mount and
 * typing back to the last query send nothing.
 */
function useQueryEmitter<R>(options: UseManualTableOptions<R>, paged: PagedQuery<R>): void {
  const { query, keys, delay } = paged;
  const requestKey = requestKeyOf(keys);
  const emitted = useRef<string | null>(null);
  const send = () => {
    if (emitted.current === requestKey) return;
    emitted.current = requestKey;
    options.onQueryChange(query);
  };
  useRequestSchedule({ requestKey, typedKey: keys.typedKey, generation: keys.generation, landedClears: keys.landedClears, delay, needed: true, send });
}

type Answer = { rows: unknown; totalRows: unknown; totalFilteredRows: unknown; loading: boolean };

function sameAnswer(a: Answer, b: Answer): boolean {
  return a.rows === b.rows && Object.is(a.totalRows, b.totalRows) && Object.is(a.totalFilteredRows, b.totalFilteredRows) && a.loading === b.loading;
}

/**
 * The request key current when the parent last changed `rows`, a total or `loading`: the
 * query those props answer. `null` until the first change, since the props at mount answer
 * no emitted query. Adjusted during render.
 */
function useAnsweredKey<R>(options: UseManualTableOptions<R>, requestKey: string): string | null {
  const { rows, totalRows, totalFilteredRows } = options;
  const answer = { rows, totalRows, totalFilteredRows, loading: Boolean(options.loading) };
  const [seen, setSeen] = useState<{ answer: Answer; key: string | null }>({ answer, key: null });
  if (sameAnswer(seen.answer, answer)) return seen.key;
  setSeen({ answer, key: requestKey });
  return requestKey;
}

/**
 * Moves to the last page when the parent's totals say the current page no longer exists.
 * Only totals that answer the current query count (changed after it, and not `loading`):
 * older totals would undo a deep-linked page or a page set with new filters.
 */
function usePageClamp<R>(options: UseManualTableOptions<R>, paged: PagedQuery<R>): void {
  const { apply, query, keys } = paged;
  const { page, pageSize } = query;
  const requestKey = requestKeyOf(keys);
  const answered = useAnsweredKey(options, requestKey) === requestKey && !options.loading;
  const total = filteredTotal(options);
  useEffect(() => {
    if (answered) clampToTotal(apply, { page, pageSize }, total);
  }, [apply, answered, page, pageSize, total]);
}

/**
 * The view key current when the parent last changed `rows`: the view those rows show. Like
 * server mode on a response, the scroll position resets when the new rows arrive, not while
 * the old ones still show under the new query. Adjusted during render.
 */
function useRowsViewKey(rows: unknown, viewKey: string): string {
  const [seen, setSeen] = useState({ rows, viewKey });
  if (seen.rows === rows) return seen.viewKey;
  setSeen({ rows, viewKey });
  return viewKey;
}

/**
 * Manual-mode table: server mode without the fetch. The view state becomes the same `Query`
 * on the same schedule, handed to `onQueryChange`; the parent loads it and passes back
 * `rows`, the totals and `loading`. Counter, page count, page clamping and page-scoped
 * selection follow the server-mode rules.
 */
export function useManualTable<R>(options: UseManualTableOptions<R>): PagedTable<R> {
  const paged = usePagedQuery(options);
  useQueryEmitter(options, paged);
  usePageClamp(options, paged);
  const loading = Boolean(options.loading);
  const { rows, totalRows, totalFilteredRows } = options;
  // Like server mode before its first response: no counter while the first page loads.
  const showCounter = !loading || sourceSize(rows) > 0;
  const model = usePageModel(options, paged, { result: { rows, totalRows, totalFilteredRows }, rows, showCounter });
  return { ...model, viewKey: useRowsViewKey(rows, paged.keys.viewKey), loading, error: false };
}
