import { BTTable, type Column } from '../../src';
import { COLUMNS, type DemoRow, generateRows } from '../data';
import { type CardGroup, useDemoTheme } from './cardKit';
import source from './filters.tsx?raw';

const ROWS = generateRows(300, 4);
const NAME: Column<DemoRow> = { key: 'name', header: 'Name', width: 160 };
const STATUSES = ['Active', 'Pending', 'Archived', 'Blocked'].map((value) => ({ value, label: value }));
const TAGS = ['billing', 'support', 'urgent', 'vip', 'legacy', 'beta'].map((value) => ({ value, label: value }));

// #region filter-text
const TEXT_COLUMNS: Column<DemoRow>[] = [
  NAME,
  { key: 'notes', header: 'Notes', minWidth: 220, filter: { type: 'text', op: 'contains', placeholder: 'Contains…' } },
];

function TextFilter() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={TEXT_COLUMNS}
      rows={ROWS}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region filter-number
const NUMBER_COLUMNS: Column<DemoRow>[] = [
  NAME,
  { key: 'amount', header: 'Amount', width: 120, align: 'right', filter: { type: 'number', op: 'range' } },
];

function NumberFilter() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={NUMBER_COLUMNS}
      rows={ROWS}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region filter-date
const DATE_COLUMNS: Column<DemoRow>[] = [
  NAME,
  { key: 'created', header: 'Created', width: 120, filter: { type: 'date', op: 'after' } },
];

function DateFilter() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={DATE_COLUMNS}
      rows={ROWS}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region filter-datetime
// The rows hold days only, so this column adds a time of day to show minute precision.
const updatedAt = (row: DemoRow) => new Date(row.created.getTime() + (row.id % 96) * 900_000);
const STAMP = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' });

const DATETIME_COLUMNS: Column<DemoRow>[] = [
  NAME,
  {
    key: 'updated',
    header: 'Updated',
    width: 170,
    value: updatedAt,
    render: ({ value }) => STAMP.format(value as Date),
    filter: { type: 'datetime', op: 'range' },
  },
];

function DateTimeFilter() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={DATETIME_COLUMNS}
      rows={ROWS}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region filter-select
const SELECT_COLUMNS: Column<DemoRow>[] = [
  NAME,
  { key: 'status', header: 'Status', width: 110, filter: { type: 'select', options: STATUSES } },
];

function SelectFilter() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={SELECT_COLUMNS}
      rows={ROWS}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region filter-multiselect
// An array value matches when any of its items is chosen.
const MULTISELECT_COLUMNS: Column<DemoRow>[] = [
  NAME,
  { key: 'tags', header: 'Tags', width: 180, sortable: false, filter: { type: 'multiselect', options: TAGS } },
];

function MultiSelectFilter() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={MULTISELECT_COLUMNS}
      rows={ROWS}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region filter-not-empty
const NOT_EMPTY_COLUMNS: Column<DemoRow>[] = [
  NAME,
  { key: 'email', header: 'Email', width: 240, filter: { type: 'notEmpty' } },
];

function NotEmptyFilter() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={NOT_EMPTY_COLUMNS}
      rows={ROWS}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region default-filters
// Applied at mount and again on resetKey; "Clear all" empties them.
function DefaultFilters() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={COLUMNS}
      rows={ROWS}
      defaultFilters={{ status: 'Active', amount: [1000, null] }}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

export const FILTERS: CardGroup = {
  title: 'Filters',
  source,
  cards: [
    { id: 'filter-text', title: 'Text filter', when: 'Free text on one column (contains, equals, starts or ends with).', Demo: TextFilter },
    { id: 'filter-number', title: 'Number filter', when: 'Amounts, counts, ages: an exact value or a from–to range.', Demo: NumberFilter },
    { id: 'filter-date', title: 'Date filter', when: 'Calendar days: on, before, after or a range.', Demo: DateFilter },
    { id: 'filter-datetime', title: 'Date-time filter', when: 'Timestamps compared to the minute.', Demo: DateTimeFilter },
    { id: 'filter-select', title: 'Select filter', when: 'One choice out of a short, fixed list.', Demo: SelectFilter },
    { id: 'filter-multiselect', title: 'Multi-select filter', when: 'Several choices, or list values such as tags.', Demo: MultiSelectFilter },
    { id: 'filter-not-empty', title: 'Not-empty filter', when: 'Hide rows missing an optional value.', Demo: NotEmptyFilter },
    { id: 'default-filters', title: 'Default filters', when: 'Open the table already narrowed (every filter type, from demo/data.tsx).', Demo: DefaultFilters },
  ],
};
