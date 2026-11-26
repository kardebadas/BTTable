import { BTTable, type Column } from '../../src';
import { COLUMNS, type DemoRow, generateRows } from '../data';
import source from './basics.tsx?raw';
import { type CardGroup, useDemoTheme } from './cardKit';

const FEW_ROWS = generateRows(12, 1);
const ROWS = generateRows(300, 2);
const MANY_ROWS = generateRows(5_000, 3);

// #region simple
// No `filter` on any column: no filters panel.
const PLAIN_COLUMNS: Column<DemoRow>[] = [
  { key: 'id', header: 'ID', width: 60, align: 'right' },
  { key: 'name', header: 'Name', width: 160 },
  { key: 'status', header: 'Status', width: 100 },
  { key: 'created', header: 'Created', width: 110 },
];

function SimpleTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={PLAIN_COLUMNS}
      rows={FEW_ROWS}
      search={false}
      showCounter={false}
      pagination={false}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region static
// `sortable: false` on every column: plain header cells, no sort buttons.
const STATIC_COLUMNS: Column<DemoRow>[] = PLAIN_COLUMNS.map((column) => ({ ...column, sortable: false }));

function StaticTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={STATIC_COLUMNS}
      rows={FEW_ROWS}
      search={false}
      showCounter={false}
      pagination={false}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region headerless
function HeaderlessTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={PLAIN_COLUMNS}
      rows={FEW_ROWS.slice(0, 5)}
      search={false}
      showCounter={false}
      pagination={false}
      showTableHeader={false}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region search-only
function SearchOnlyTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={PLAIN_COLUMNS}
      rows={ROWS}
      searchPlaceholder="Search name, status, date…"
      showCounter={false}
      pagination={false}
      maxHeight={320}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region paginated
function PaginatedTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={PLAIN_COLUMNS}
      rows={ROWS}
      search={false}
      pageSize={10}
      pageSizeOptions={[10, 25, 50]}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region virtualized
// pagination={false}: all 5,000 rows in one scroll; only the rows near the viewport are mounted.
function VirtualizedTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={COLUMNS}
      rows={MANY_ROWS}
      pagination={false}
      maxHeight={360}
      className={theme} // demo theme
    />
  );
}
// #endregion

export const BASICS: CardGroup = {
  title: 'Basics',
  source,
  cards: [
    { id: 'simple', title: 'Simple table', when: 'Just rows and sortable headers: no search, filters, counter, pagination or export.', Demo: SimpleTable },
    { id: 'static', title: 'Static (no sorting)', when: 'A read-only listing whose order you set yourself.', Demo: StaticTable },
    { id: 'headerless', title: 'No header row', when: 'Key/value style lists where column titles add nothing (showTableHeader={false}).', Demo: HeaderlessTable },
    { id: 'search-only', title: 'Search only', when: 'One box that searches every column; nothing else in the toolbar.', Demo: SearchOnlyTable },
    { id: 'paginated', title: 'Pagination', when: 'Long lists read page by page, with a page-size choice.', Demo: PaginatedTable },
    { id: 'virtualized', title: 'No pagination, virtualized', when: 'Thousands of rows in one scroll (pagination={false}); rows mount as they scroll in.', Demo: VirtualizedTable },
  ],
};
