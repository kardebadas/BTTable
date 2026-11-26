import { useCallback, useRef, useState } from 'react';
import { BTTable, type FetchAllRows, type FetchRows, type Query } from '../src';
import { COLUMNS, type DemoRow, generateRows } from './data';
import { fakeFetch, fakeFetchAll, LATENCY_MS } from './fakeServer';

const SERVER_ROWS = generateRows(20_000, 7);
const fetchAllRows: FetchAllRows<DemoRow> = (query, { signal }) => fakeFetchAll({ rows: SERVER_ROWS, columns: COLUMNS, query, signal });

type ServerButtonsProps = { armed: boolean; onFail: () => void; onRefresh: () => void; onReset: () => void };

function ServerButtons({ armed, onFail, onRefresh, onReset }: ServerButtonsProps) {
  return (
    <div className="demo-bar">
      <span>20,000 rows on a fake server, {LATENCY_MS} ms per request.</span>
      <button type="button" onClick={onFail} disabled={armed}>
        {armed ? 'Next request will fail' : 'Fail next request'}
      </button>
      <button type="button" onClick={onRefresh}>Refresh</button>
      <button type="button" onClick={onReset}>Reset search and filters</button>
    </div>
  );
}

/**
 * Server mode against an in-memory backend: every page, search, filter and sort goes
 * through `fetchRows`; CSV exports every filtered row through `fetchAllRows`. Buttons make
 * the next request fail, refetch (`refreshKey`) and reset search and filters (`resetKey`);
 * the last query sent is shown below the table.
 */
export function ServerDemo({ themeClass }: { themeClass?: string }) {
  const failNext = useRef(false);
  const [armed, setArmed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [lastQuery, setLastQuery] = useState<Query | null>(null);
  const fetchRows = useCallback<FetchRows<DemoRow>>((query, { signal }) => {
    const fail = failNext.current;
    failNext.current = false;
    setArmed(false);
    return fakeFetch({ rows: SERVER_ROWS, columns: COLUMNS, query, signal, fail });
  }, []);
  const arm = () => {
    failNext.current = true;
    setArmed(true);
  };
  return (
    <section className="demo-panel">
      <ServerButtons armed={armed} onFail={arm} onRefresh={() => setRefreshKey((key) => key + 1)} onReset={() => setResetKey((key) => key + 1)} />
      <BTTable
        columns={COLUMNS}
        fetchRows={fetchRows}
        refreshKey={refreshKey}
        resetKey={resetKey}
        onQueryChange={setLastQuery}
        pageSize={50}
        selectable
        exportCsv
        fetchAllRows={fetchAllRows}
        caption="Rows from the fake server"
        className={themeClass}
        maxHeight={520}
      />
      <details className="demo-query">
        <summary>Last query sent to fetchRows</summary>
        <pre>{JSON.stringify(lastQuery, null, 2)}</pre>
      </details>
    </section>
  );
}
