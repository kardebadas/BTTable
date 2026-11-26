import { useRef, useState } from 'react';
import { BTTable, type BTTableHandle, type ExportData, type FilterState, type SortState } from '../../src';
import { COLUMNS, generateRows } from '../data';
import { type CardGroup, useDemoTheme } from './cardKit';
import source from './state.tsx?raw';

const ROWS = generateRows(300, 6);

// #region export
// onExport gets plain data (headers + cells): hand it to any writer (pdfmake, SheetJS…).
function downloadJson(format: string, { headers, rows }: ExportData) {
  const records = rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `people.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const EXPORT_FORMATS = ['json'];

function ExportTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={COLUMNS}
      rows={ROWS}
      exportCsv
      exportFileName="people.csv"
      exportFormats={EXPORT_FORMATS}
      onExport={downloadJson}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region controlled
type ViewControlsProps = {
  search: string;
  setSearch: (text: string) => void;
  setFilters: (filters: FilterState) => void;
  setSort: (sort: SortState) => void;
};

function ViewControls({ search, setSearch, setFilters, setSort }: ViewControlsProps) {
  return (
    <>
      <input aria-label="Outside search" placeholder="Outside search" value={search} onChange={(event) => setSearch(event.target.value)} />
      <button type="button" onClick={() => setFilters({ status: 'Blocked' })}>Only blocked</button>
      <button type="button" onClick={() => setSort({ key: 'amount', direction: 'desc' })}>Largest amount first</button>
    </>
  );
}

function ControlledTable() {
  const theme = useDemoTheme(); // demo theme
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  return (
    <>
      <div className="demo-bar">
        <ViewControls search={search} setSearch={setSearch} setFilters={setFilters} setSort={setSort} />
        <button type="button" onClick={() => setPage(3)}>Page 3</button>
        <button type="button" onClick={() => setResetKey((key) => key + 1)}>Reset search and filters</button>
        <span>page {page}, sort {sort ? `${sort.key} ${sort.direction}` : 'none'}</span>
      </div>
      <BTTable
        columns={COLUMNS}
        rows={ROWS}
        searchValue={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        page={page}
        onPageChange={setPage}
        resetKey={resetKey}
        pageSize={10}
        className={theme} // demo theme
      />
    </>
  );
}
// #endregion

// #region handle
function HandleTable() {
  const theme = useDemoTheme(); // demo theme
  const table = useRef<BTTableHandle>(null);
  const [result, setResult] = useState('');
  const report = (name: string, ok: boolean) => setResult(`${name}: ${ok ? 'done' : 'row not displayed'}`);
  return (
    <>
      <div className="demo-bar">
        <button type="button" onClick={() => report('scrollToRow(250)', table.current?.scrollToRow(250, { align: 'center' }) ?? false)}>
          Scroll to row 250
        </button>
        <button type="button" onClick={() => report('focusCell(120, name)', table.current?.focusCell(120, 'name') ?? false)}>
          Focus row 120, Name
        </button>
        <button type="button" onClick={() => table.current?.resetView()}>Reset view</button>
        <span role="status">{result}</span>
      </div>
      <BTTable
        ref={table}
        columns={COLUMNS}
        rows={ROWS}
        pagination={false}
        maxHeight={320}
        className={theme} // demo theme
      />
    </>
  );
}
// #endregion

export const STATE: CardGroup = {
  title: 'Export, state and handle',
  source,
  cards: [
    { id: 'export', title: 'Export: CSV and a custom format', when: 'Download what is on screen (every filtered, sorted row); JSON here via exportFormats + onExport.', Demo: ExportTable },
    {
      id: 'controlled',
      title: 'Controlled state and resetKey',
      when: 'Search, filters, sort and page owned by the parent (URL sync, saved views); resetKey restores the defaults.',
      Demo: ControlledTable,
    },
    { id: 'handle', title: 'Imperative handle', when: 'Jump to or focus a row from outside (search results, deep links), or reset the view.', Demo: HandleTable },
  ],
};
