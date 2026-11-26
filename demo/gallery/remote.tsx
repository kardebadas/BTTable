import { useEffect, useState } from 'react';
import { BTTable, type FetchResult, type FetchRows, type Query } from '../../src';
import { COLUMNS, type DemoRow, generateRows } from '../data';
import { fakeFetch } from '../fakeServer';
import { type CardGroup, useDemoTheme } from './cardKit';
import source from './remote.tsx?raw';

// The fake backend's data; a real app has it in a database.
const SERVER_ROWS = generateRows(20_000, 8);

// #region server
// fakeFetch stands in for `fetch('/api/people', { body: JSON.stringify(query), signal })`.
const fetchRows: FetchRows<DemoRow> = (query, { signal }) => fakeFetch({ rows: SERVER_ROWS, columns: COLUMNS, query, signal });

function ServerTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={COLUMNS}
      fetchRows={fetchRows}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region manual
type Loaded = { query: Query | null; page: FetchResult<DemoRow> };

function ManualTable() {
  const theme = useDemoTheme(); // demo theme
  const [query, setQuery] = useState<Query | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ query: null, page: { rows: [], totalRows: 0 } });
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fakeFetch({ rows: SERVER_ROWS, columns: COLUMNS, query, signal: controller.signal }).then(
      (page) => setLoaded({ query, page }),
      () => {}, // aborted by a newer query; a real app also shows errors
    );
    return () => controller.abort();
  }, [query]);
  return (
    <BTTable
      columns={COLUMNS}
      mode="manual"
      onQueryChange={setQuery}
      rows={loaded.page.rows}
      totalRows={loaded.page.totalRows}
      totalFilteredRows={loaded.page.totalFilteredRows}
      loading={loaded.query !== query}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

export const REMOTE: CardGroup = {
  title: 'Server data',
  source,
  cards: [
    { id: 'server', title: 'Server mode (fetchRows)', when: 'Too many rows to hold: the table asks your API for each page (20,000 rows, 300 ms latency here).', Demo: ServerTable },
    { id: 'manual', title: 'Manual mode', when: 'Your own data layer (React Query, Redux…) loads each page; the table only emits the query.', Demo: ManualTable },
  ],
};
