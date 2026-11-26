import { useEffect, useState } from 'react';
import { BTTable, type Query } from '../src';
import { COLUMNS, type DemoRow, generateRows } from './data';
import { fakeFetch, LATENCY_MS } from './fakeServer';

const MANUAL_ROWS = generateRows(5_000, 11);

type Page = { query: Query | null; rows: DemoRow[]; totalRows?: number; totalFilteredRows?: number; error?: boolean };

/**
 * Loads each query the table emits through the fake server; a newer query aborts the
 * request in flight, and the cleanup flag drops any response that still arrives. Loading
 * lasts until the page on screen answers the latest query; a failure ends it with `error`.
 */
function useManualPages(query: Query | null) {
  const [page, setPage] = useState<Page>({ query: null, rows: [] });
  useEffect(() => {
    if (!query) return;
    let current = true;
    const controller = new AbortController();
    fakeFetch({ rows: MANUAL_ROWS, columns: COLUMNS, query, signal: controller.signal })
      .then(
        (result) => current && setPage({ query, ...result }),
        // A failure (not an abort: aborted requests are no longer current) answers the query, so loading ends.
        () => current && setPage({ query, rows: [], error: true }),
      );
    return () => {
      current = false;
      controller.abort();
    };
  }, [query]);
  return { page, loading: query === null || page.query !== query };
}

/**
 * Manual mode: the parent owns the data. The table only emits `onQueryChange`; this
 * component loads the page and passes `rows`, the totals and `loading` back.
 */
export function ManualDemo({ themeClass }: { themeClass?: string }) {
  const [query, setQuery] = useState<Query | null>(null);
  const { page, loading } = useManualPages(query);
  return (
    <section className="demo-panel">
      <div className="demo-bar">
        <span>5,000 rows loaded by the parent, {LATENCY_MS} ms per request; the table never fetches.</span>
      </div>
      <BTTable
        columns={COLUMNS}
        mode="manual"
        rows={page.rows}
        totalRows={page.totalRows}
        totalFilteredRows={page.totalFilteredRows}
        loading={loading}
        emptyMessage={page.error ? 'Could not load the rows. Change the query to try again.' : undefined}
        onQueryChange={setQuery}
        pageSize={50}
        selectable
        caption="Rows loaded by the parent"
        className={themeClass}
        maxHeight={520}
      />
    </section>
  );
}
