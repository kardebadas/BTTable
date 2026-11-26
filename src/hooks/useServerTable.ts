import { useCallback } from 'react';
import type { FetchResult, FetchRows, Query } from '../core/types';
import { clampToTotal, filteredTotal, NO_ROWS, type PagedTable, type PagedTableOptions, usePagedQuery, usePageModel } from './usePagedTable';
import { useServerFetch } from './useServerFetch';

/** Input of `useServerTable`; the server-mode subset of the table props. */
export type UseServerTableOptions<R> = PagedTableOptions<R> & { fetchRows: FetchRows<R> };

/** Server table state, the current page's rows and actions, as consumed by the table components. */
export type ServerTable<R> = PagedTable<R>;

/**
 * Server-mode table: the shared view state turned into a `Query` sent through `fetchRows`
 * (`useServerFetch`), the page clamped to the reported total, the counter from the server
 * totals, and selection whose select-all box covers the current page while ids on other
 * pages stay selected.
 */
export function useServerTable<R>(options: UseServerTableOptions<R>): ServerTable<R> {
  const paged = usePagedQuery(options);
  const { apply, query, keys, delay } = paged;
  const onResult = useCallback((sent: Query, result: FetchResult<R>) => clampToTotal(apply, sent, filteredTotal(result)), [apply]);
  const fetchInput = { fetchRows: options.fetchRows, query, ...keys, delay, onQueryChange: options.onQueryChange, onResult };
  const { result, viewKey, loading, error } = useServerFetch(fetchInput);
  // After a failure no rows show, so select-all and export cover nothing stale. The counter is
  // hidden (`undefined`) until the first response and after a failure, rather than "No records".
  const rows = error ? NO_ROWS : (result?.rows ?? NO_ROWS);
  const model = usePageModel(options, paged, { result, rows, showCounter: Boolean(result) && !error });
  return { ...model, viewKey, loading, error };
}
