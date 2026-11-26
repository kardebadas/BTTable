# @kardebadas/bttable

A fixed-layout React data table for rows you hold in memory (**client mode**) or pages a
server sends you (**server mode**). Search, per-column filters, sorting, pagination, row
selection, CSV export and row virtualization, with zero runtime dependencies.

Column widths come only from your column definitions (a `<colgroup>` under
`table-layout: fixed`), so the header never shifts while you scroll, whatever rows are
mounted.

- React 18 or 19 (peer dependency), ESM + CommonJS + TypeScript types.
- One stylesheet, themed with CSS custom properties, light and dark.
- Free for noncommercial use; commercial use needs a paid license (see [License](#license)).

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Columns](#columns)
- [Rows and ids](#rows-and-ids)
- [Table props](#table-props)
- [Filters](#filters)
- [Search and sorting](#search-and-sorting)
- [Controlled view state](#controlled-view-state)
- [Server mode](#server-mode)
- [Manual mode](#manual-mode)
- [Selection](#selection)
- [Detail rows](#detail-rows)
- [Export](#export)
- [Layout, virtualization and performance](#layout-virtualization-and-performance)
- [Imperative handle (ref)](#imperative-handle-ref)
- [Labels (i18n)](#labels-i18n)
- [Theming](#theming)
- [Accessibility](#accessibility)
- [Server-side rendering](#server-side-rendering)
- [Browser support](#browser-support)
- [Other exports](#other-exports)
- [Development](#development)
- [License](#license)

## Install

```sh
npm i @kardebadas/bttable
```

Import the stylesheet once, anywhere in your app:

```ts
import '@kardebadas/bttable/styles.css';
```

## Quick start

Pass exactly one of `rows` (client mode) or `fetchRows` (server mode). Passing both or
neither is a TypeScript error (`BTTableProps` is a union of `BTTableClientProps` and
`BTTableServerProps`), and at runtime the table renders its error fallback and calls
`onError`.

### Client mode

```tsx
import { BTTable, type Column } from '@kardebadas/bttable';
import '@kardebadas/bttable/styles.css';

type Person = { id: number; name: string; age: number; joined: string; role: string };

// Module-level (or useMemo): see "Layout, virtualization and performance".
const columns: Column<Person>[] = [
  { key: 'name', header: 'Name', filter: { type: 'text' } },
  { key: 'age', header: 'Age', width: 80, align: 'right', filter: { type: 'number', op: 'range' } },
  { key: 'joined', header: 'Joined', width: 120, filter: { type: 'date', op: 'after' } },
  {
    key: 'role',
    header: 'Role',
    width: 140,
    filter: { type: 'select', options: [{ value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }] },
  },
];

export function People({ people }: { people: Person[] }) {
  return <BTTable columns={columns} rows={people} exportCsv selectable />;
}
```

### Server mode

```tsx
import { BTTable, type FetchRows } from '@kardebadas/bttable';

const fetchRows: FetchRows<Person> = async (query, { signal }) => {
  const response = await fetch('/api/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal, // lets the table cancel requests it no longer needs
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json(); // { rows, totalRows, totalFilteredRows? }
};

export function People() {
  return <BTTable columns={columns} fetchRows={fetchRows} />;
}
```

## Columns

```ts
type Column<R> = {
  key: string;
  header: ReactNode;
  headerText?: string;
  width?: number | string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  value?: (row: R) => unknown;
  render?: (ctx: CellContext<R>) => ReactNode;
  cell?: ComponentType<CellContext<R>>;
  cellProps?: object | ((row: R) => object);
  sortable?: boolean;
  sortValue?: (row: R) => unknown;
  searchable?: boolean;
  searchValue?: (row: R) => string;
  exportValue?: (row: R) => unknown;
  filter?: FilterSpec;
  cellClassName?: string | ((row: R) => string | undefined);
  headerClassName?: string;
  colClassName?: string;
  onCellClick?: (event: MouseEvent<HTMLTableCellElement>, ctx: CellContext<R>) => void;
  onCellChange?: (event: FormEvent<HTMLTableCellElement>, ctx: CellContext<R>) => void;
  onCellBlur?: (event: FocusEvent<HTMLTableCellElement>, ctx: CellContext<R>) => void;
};

type CellContext<R> = { row: R; value: unknown; rowIndex: number; rowId: string | number; column: Column<R> };
```

| Field | Default | Meaning |
| --- | --- | --- |
| `key` | required | Unique per table. Also the default accessor: `row[key]`. |
| `header` | required | Header content: text or any React node. |
| `headerText` | `header` when it is a string, else `key` | Plain-text name, used for export headers, the filter label and the accessible name of a node header. |
| `width` | equal share of the remaining space | A number (px) or any CSS width (`'20%'`, `'12rem'`). |
| `minWidth` | `60` | Px. Each column adds its numeric `width`, else its `minWidth`, to the table's `min-width`; below that the table scrolls horizontally. |
| `align` | `'left'` | Header and cell alignment. |
| `value` | `row[key]` | The raw value used for display, sorting, search, filters and export unless a more specific function is given. |
| `render` | the formatted value | Cell content. Default formatting: `null`/`undefined`/`NaN` → empty, booleans → `Yes`/`No`, dates → `M/D/YYYY`, arrays comma-joined, React elements as is, and an array holding React elements as a fragment (elements as they are, other items as text; export and search use the text). `rowIndex` is the row's index in `rows` (a map: its position); `rowId` is its id. |
| `cell` | none | Cell content as a real component, rendered as `<cell {...cellProps} {...ctx} />`: hooks, effects, `memo` and `forwardRef` work. Wins over `render`. Keep it stable (module level): a new component type remounts every cell. Display only: sort, search, filters and export still read `value`. |
| `cellProps` | none | Extra props for `cell`: an object, or `(row) => object`. The `CellContext` props win on a clash; `key` and `ref` are dropped (they are not props). Give the component's extra props as optional (`CellContext<R> & { tone?: string }`). |
| `sortable` | `true` | `false` renders a plain header with no sort button. |
| `sortValue` | `value` | The value the column sorts by. |
| `searchable` | `true` | `false` leaves the column out of the global search. |
| `searchValue` | text of `value` | The text the global search looks in. |
| `exportValue` | `value` | The value written by CSV and `onExport`. |
| `filter` | none | A filter widget for this column; see [Filters](#filters). |
| `cellClassName` | none | Class for every body cell of the column, or a function of the row. |
| `headerClassName` | none | Class for the header cell. |
| `colClassName` | none | Class on the column's `<col>`: a styling hook only (e.g. a background for the whole column). Widths still come from `width`. |
| `onCellClick` | none | `(event, ctx) => void` on a click in a body cell of the column; `ctx` is the `CellContext` (with `rowId`). |
| `onCellChange` | none | `(event, ctx) => void` on a change event bubbling from an input inside the cell (`event.target` is the input). |
| `onCellBlur` | none | `(event, ctx) => void` on a blur bubbling from an element inside the cell. |

The cell handlers sit on the `<td>`; clicks on the selection checkbox never reach them.
They come from `columns`, so keep the columns stable and rows stay memoized.

`render`, `value`, `sortValue` and the other functions are plain functions called by the
table, not components: **do not call hooks inside them**. If a cell needs state or effects,
use `cell`:

```tsx
function StatusCell({ row, label }: CellContext<Person> & { label?: string }) {
  const [open, setOpen] = useState(false);
  return <button onClick={() => setOpen(!open)}>{label}: {row.status}</button>;
}
const columns: Column<Person>[] = [{ key: 'status', header: 'Status', cell: StatusCell, cellProps: { label: 'Status' } }];
```

## Rows and ids

- `rows: readonly R[] | Record<string, R>` — client mode data: an array, or an object map
  whose values are the rows and whose keys are the id fallback. Rows come in JavaScript
  property order: integer-like keys (`'7'`, `'12'`) come first, in ascending numeric order,
  before the other keys in insertion order — to control the order, pass an array or use
  non-numeric keys. Entries that are `null` or not objects are skipped,
  with a warning in development (server mode warns the same way for each response).
- `getRowId?: (row, index) => string | number` — the default is the first string or number
  among `row.id`, `row.ID`, `row.INDEX`, `row.N_ID`, else the map key (rows given as a map),
  else the row's index in `rows`. `index` is the array index, or the position in a map. Ids
  taken from map keys are strings (`'7'`, not `7`): pass them as strings in `selectedIds` /
  `defaultSelectedIds`, or set `getRowId`. Ids are
  React keys, height-cache keys and selection ids. **Selection needs stable ids**: an index
  changes when rows are reordered or replaced, and in server mode it is the position on the
  page, so it collides across pages. Server rows need real ids (development warning when a
  selectable server table has rows without one and no `getRowId`). Ids must be unique:
  in development the table warns once per `rows` array (or server response) when some rows
  repeat an earlier row's id. It also warns once per table when a row has two of `id`, `ID`,
  `INDEX`, `N_ID` whose values differ (`7` and `'7'` agree) and no `getRowId` picks one.
- `rowClassName?: (row, index) => string | undefined` — extra class for a body row.
- `rowTone?: (row, index) => 'danger' | 'warning' | 'success' | 'info' | undefined` — colours
  the row (class `btt-row--tone-<tone>`, from the `--btt-tone-*` variables, light and dark,
  AA contrast). It sits over striping and hover and under the selection tint; a
  `rowClassName` style of yours still wins. Unknown tones are ignored.
- `onRowMount?: (row, element, rowId) => void` / `onRowUnmount?: (row, rowId) => void` —
  called in an effect after a data row mounts, and in its cleanup when it unmounts (with the
  row as last rendered). A re-render of the row with the same id calls neither. With
  virtualization they fire as rows enter and leave the mounted window (scrolling mounts and
  unmounts rows), and a page change unmounts the old page's rows. Every mount is paired
  with an unmount, StrictMode's double effects included. They need not be stable: rows read
  the latest functions without re-rendering. Rows already mounted when the callbacks are
  first set get neither call; a row that got its mount still gets its unmount after
  `onRowUnmount` is removed (the function it mounted with).
- `rowProps?: (row, index) => attributes` — any `<tr>` attributes, including `onClick`,
  `data-*` and `className` (merged with the table's classes). `index` is the row's index in
  `rows` (server mode: on the page).

**Not carried over from the legacy table, on purpose:**

- The legacy id order (`INDEX` first) — `id` is the standard field and `INDEX` came first for
  one internal shape only. The order stays `id` → `ID` → `INDEX` → `N_ID`; the warning above
  makes the ambiguity visible instead of resolving it silently.
- `rowRef` / `colRef` maps on the data — refs stored on row objects break memoization and
  serialization. Use the [imperative handle](#imperative-handle-ref) (`getRowElement`,
  `getCellElement`) or `onRowMount`.
- Per-row `Componet` renderer maps — a reserved key on the data. Per-column `cell` with the
  row in its props covers every use.
- `runOnRender` — side effects during render, with no cleanup, repeated on every scroll.
  Use `onRowMount` / `onRowUnmount` or effects inside a `cell` component.

Every body row has the class `btt-row` plus `btt-row--odd` or `btt-row--even` by its
position in the displayed list (the first row is odd). The row that shows the empty message
or the load error has the class `btt-empty-row` instead.

## Table props

`BTTableProps<R>`. Everything except `columns` and one of `rows` / `fetchRows` is optional
(manual mode also needs `mode="manual"` and `onQueryChange`).

### Data

| Prop | Default | Meaning |
| --- | --- | --- |
| `columns` | required | Column definitions. Keep the array stable (module-level or `useMemo`). |
| `rows` | – | Client mode data: an array or an object map (keys are the id fallback). Keep the array stable: a new array re-filters and re-sorts every row. A new array for the same view (polling) keeps the scroll position. |
| `fetchRows` | – | Server mode data source; see [Server mode](#server-mode). A new function identity does not refetch. |
| `fetchAllRows` | – | Server and manual mode: `(query, { signal }) => Promise<R[]>`, every row matching the query without paging, so exports cover every filtered row; see [Export](#export). Not accepted in client mode (a type error): client exports already cover every filtered row. |
| `mode` | – | `"manual"`: the parent loads each page; see [Manual mode](#manual-mode). |
| `totalRows` / `totalFilteredRows` | – | Manual mode only: the totals of the page the parent passes. |
| `getRowId` | `id`/`ID`/`INDEX`/`N_ID`, else map key, else index | Row id; see [Rows and ids](#rows-and-ids). |
| `rowClassName` | – | `(row, index) => class`. Keep it stable. |
| `rowProps` | – | `(row, index) => <tr> attributes`. Keep it stable. |
| `rowTone` | – | `(row, index) => 'danger' \| 'warning' \| 'success' \| 'info' \| undefined`. Keep it stable. |
| `onRowMount` / `onRowUnmount` | – | `(row, element, rowId)` / `(row, rowId)` as a data row mounts / unmounts; see [Rows and ids](#rows-and-ids). |
| `ref` | – | A `BTTableHandle`; see [Imperative handle](#imperative-handle-ref). |

### Toolbar, search and paging

| Prop | Default | Meaning |
| --- | --- | --- |
| `search` | `true` | Show the global search box (with a clear button). |
| `searchPlaceholder` | `'Search…'` | Placeholder of the search box. |
| `searchDebounceMs` | `250` | Quiet time before typed search applies. In server mode it also delays typed `text`, `number`, `date` and `datetime` filters. |
| `showCounter` | `true` | "Showing 1–100 of 2,345", plus "(filtered from 50,000)" when filtering hid rows, or "No records". In server and manual mode a small "?" button next to it explains that search and filters run on the whole dataset and one page shows (the `counterHelp` label, in a tooltip on hover or focus; Escape closes it). |
| `clearAll` | `true` | A "Clear all" button, shown while the search box holds text or any filter is active: it empties both at once (no debounce; server and manual mode send the cleared query at once) and returns to page 1, reported through `onSearchChange`, `onFiltersChange` and `onPageChange`. Filters go to empty, not to their defaults (that is `resetKey`). `false` hides it. The search box's own × clears the search only. |
| `pagination` | `true` | Client mode: `false` shows every filtered row in one scroll (virtualized). Server mode always paginates; `false` is ignored with a development warning. |
| `pageSize` | `100` | Initial page size. Changing the prop resyncs the table. |
| `pageSizeOptions` | `[25, 50, 100, 500]` | Choices of the page-size select; positive whole numbers only. The current size is added when missing. |
| `toolbarExtras` | – | Your own content (buttons, badges) placed at the end of the toolbar. |
| `portalContainer` | `document.body` | Where `multiselect` filter popovers are portalled. The popover is `position: fixed` at its button, so an `overflow: hidden` ancestor never clips it; it follows the button on any scroll or resize, opens above it when there is no room below, and copies the table's theme (the computed `--btt-*` values and the `btt-theme-*` class), so it looks the same wherever it lands. Pass an element inside a focus-trapping modal so the popover stays inside the trap. The container must not sit inside an element with `transform`, `filter`, `perspective` or `contain` set: such an ancestor becomes the containing block of `position: fixed`, and the popover lands offset from its button. Events from the popover still bubble through the React tree (to the table's ancestors' React handlers), as with any React portal; Escape and Tab inside it are consumed. |
| `resetKey` | – | Change it to put search and filters back to their defaults (`defaultSearchValue`, `defaultFilters` over the columns' `defaultValue`) and return to page 1. Sort and page size stay. The changes go to the callbacks below. |

### View state (controlled or uncontrolled)

See [Controlled view state](#controlled-view-state). A defined value prop controls that piece;
each callback fires on every change the table makes, controlled or not.

| Prop | Default | Meaning |
| --- | --- | --- |
| `searchValue` | – | Controlled applied search text (the debounced value, not each keystroke). |
| `defaultSearchValue` | `''` | Initial search text when uncontrolled; also what `resetKey` returns to. |
| `onSearchChange` | – | `(text) => void` when a search applies (after the debounce, or at once on clear). |
| `filters` | – | Controlled filter values, `{ [columnKey]: value }` (`FilterState`). |
| `defaultFilters` | – | Initial filter values, merged over the columns' `filter.defaultValue`; also what `resetKey` returns to. |
| `onFiltersChange` | – | `(filters) => void` with the whole new `FilterState`. |
| `sort` | – | Controlled sort, `{ key, direction }`, or `null` for a controlled "unsorted". |
| `defaultSort` | `null` | Initial sort when uncontrolled. |
| `onSortChange` | – | `(sort) => void` with the next sort of the cycle (`null` = unsorted). |
| `page` | – | Controlled 1-based page. |
| `defaultPage` | `1` | Initial page when uncontrolled. |
| `onPageChange` | – | `(page) => void`, including the moves to page 1 of the reset rules and page clamping. |
| `onPageSizeChange` | – | `(size) => void` when the page-size select changes (`pageSize` itself resyncs, see above). |

### Export

| Prop | Default | Meaning |
| --- | --- | --- |
| `exportCsv` | `false` | Show a CSV button. |
| `exportFileName` | `'table.csv'` | File name of the CSV download. |
| `exportFormats` | `[]` | Extra format names (e.g. `['pdf', 'xlsx']`): one button each, shown only with `onExport`, labelled by the `exportFormat` label (default: the name in upper case). |
| `onExport` | – | `(format, data) => void`, called by the `exportFormats` buttons; see [Export](#export). |

Export buttons are disabled while loading and when there is no row to export. In server and
manual mode they export the current page only, unless `fetchAllRows` is given (see
[Export](#export)).

### Selection

| Prop | Default | Meaning |
| --- | --- | --- |
| `selectable` | `false` | Adds a checkbox column with a select-all box in the header. Turning it off clears the selection (reported once). |
| `selectedIds` | – | Controlled selection (array of row ids). |
| `defaultSelectedIds` | – | Initial selection when uncontrolled. |
| `onSelectionChange` | – | `(ids, rows) => void` after every change; `rows` are the selected rows the table knows (see [Selection](#selection)). |
| `renderSelectionBar` | – | `({ selectedIds, selectedRows, clear }) => node`: a bar between the toolbar and the table, shown while at least one row is selected. |

### Detail rows

| Prop | Default | Meaning |
| --- | --- | --- |
| `renderDetail` | – | `({ row, rowId }) => node`: adds a leading toggle column; an expanded row shows this content in a row right under it. Keep it stable. See [Detail rows](#detail-rows). |
| `expandedIds` | – | Controlled expanded rows (array of row ids; several can be open at once). |
| `defaultExpandedIds` | – | Initially expanded rows when uncontrolled. |
| `onExpandedChange` | – | `(ids) => void` after every change. |

### Layout and state

| Prop | Default | Meaning |
| --- | --- | --- |
| `maxHeight` | `600` | Height limit of the scroll area: number (px) or CSS size. `'none'` removes the inner vertical scroll and turns virtualization off. |
| `virtualize` | `'auto'` | `'auto'` mounts only the rows near the viewport when more than `virtualizeThreshold` rows are displayed; `true` always; `false` never. |
| `virtualizeThreshold` | `100` | Displayed-row count above which `'auto'` virtualizes. |
| `estimatedRowHeight` | `40` | Px assumed for a row until it is measured. |
| `loading` | `false` | Shows "Loading…" in the status strip, dims the rows and sets `aria-busy`, without unmounting rows or moving the layout. In server mode the table also sets it while a request is in flight. |
| `emptyMessage` | `'No records found'` | Any React node, shown when no row matches. While loading with no rows, skeleton rows (the page size, at most 8) show instead, so the layout does not jump. |
| `caption` | – | Visually hidden `<caption>` naming the table for assistive technology. |
| `showTableHeader` | `true` | `false` renders no `<thead>`: no sort buttons and no select-all box (row checkboxes stay). Column widths still come from `columns`. |
| `className` | – | Extra class on the root `.btt` element. |
| `tableClassName` | – | Extra class on the `<table>` (after `btt-table`). |
| `theadClassName` | – | Extra class on the `<thead>` (after `btt-thead`). |
| `tbodyClassName` | – | Extra class on the `<tbody>`. |
| `labels` | English | Partial override of every UI string; see [Labels](#labels-i18n). |
| `locale` | runtime locale | Locale of the counter and page-count numbers (e.g. `'en-US'`). Pass a fixed one when server rendering; see [Server-side rendering](#server-side-rendering). |
| `onError` | – | `(error, info) => void` when a render error is caught by the table's error boundary, or when `fetchAllRows` fails (`info.componentStack` is then empty). |

### Callbacks per mode

| Prop | Mode | Meaning |
| --- | --- | --- |
| `onStateChange` | client | `(state) => void` at mount and after each change, with `{ search, filters, sort, page, pageSize, filteredRows }` (`filteredRows`: every row passing search and filters, sorted). |
| `refreshKey` | server, manual | Change it to send (manual: emit) the current query again. |
| `onQueryChange` | server, manual | `(query) => void` with each query sent to `fetchRows` (for URL sync, logging…). Required in manual mode: each query the parent must load. |

## Filters

Give a column a `filter` and it gets a labelled widget in the filters panel above the
table. Widgets are native inputs, except `multiselect`, which is a package-owned dropdown.

| `type` | Widget | Value shape | Options |
| --- | --- | --- | --- |
| `text` | text input | `string` | `op`: `'contains'` (default), `'equals'`, `'startsWith'`, `'endsWith'`; `placeholder`; `defaultValue` |
| `number` | number input, two for `range` | `number`, or `[min, max]` (each `number \| null`) for `range` | `op`: `'eq'` (default), `'gt'`, `'gte'`, `'lt'`, `'lte'`, `'range'`; `defaultValue` |
| `date` | date input, two for `range` | ISO day `'yyyy-mm-dd'`, or `[from, to]` (each `string \| null`) for `range` | `op`: `'on'` (default), `'before'`, `'after'`, `'range'`; `defaultValue` |
| `datetime` | `datetime-local` input, two for `range` | local minute `'yyyy-mm-ddThh:mm'`, or `[from, to]` (each `string \| null`) for `range` | `op`: `'on'` (default), `'before'`, `'after'`, `'range'`; `defaultValue` (any form a row value may take, e.g. `'2026-01-05T14:07:45Z'`; the input shows it as the local minute) |
| `select` | `<select>` with an "All" choice | option `value` (`string`) | `options` (required); `defaultValue` |
| `multiselect` | button showing the choice as chips, opening checkboxes with a search box | `string[]` of option values | `options` (required); `defaultValue` |
| `notEmpty` | checkbox "Only non-empty" | `boolean` | – |

```ts
type Option = { value: string; label: ReactNode };
```

How client mode matches (against the column's `value`, default `row[key]`):

- An empty filter is inactive: `''`, blank text, an unparsable number, date or date-time, an all-empty
  range, `[]`, or `false` for `notEmpty`. `0` is a real value.
- `text` compares the cell's display text, trimmed and case-insensitive.
- `number` compares numerically; numeric strings in rows (`'12.5'`) count as numbers.
  Ranges are inclusive and either end may be open.
- `date` compares calendar days. Row values may be `Date` objects, ISO strings
  (`yyyy-mm-dd`, optionally with a time) or US strings (`M/D/YYYY`, optionally with a time).
- `datetime` compares local wall-clock minutes (seconds are ignored): `on` is the same
  minute, `before` / `after` are strict, `range` is inclusive with optional ends. Row values
  take the same forms as for `date`; a value with a zone (`…Z`, `+02:00`) or a `Date` is read
  on the browser's clock. Daylight saving: a zoneless string compares as written, so a
  clock time the change skips matches only rows written with that time, and in the repeated
  hour `on 01:30` matches both 01:30s.
- `select` matches the option value exactly against `String(value)`, or against any element
  when the value is an array; `multiselect` matches when any chosen option matches.
- `notEmpty` keeps rows whose value is not `null`, `undefined`, blank text or `[]`.

`defaultValue`s (and the `defaultFilters` prop over them) apply once at mount and again on
`resetKey`. Changing the identity of
`columns` does not clear active filters. A filter change returns to page 1.

Number inputs (filters and the page box) blur when the mouse wheel turns over them while
they have focus, so scrolling the page never changes a value; the scroll itself is never
blocked.

## Search and sorting

**Search** is debounced (`searchDebounceMs`, 250 ms) and matches a case-insensitive
substring of each searchable column's `searchValue` (default: the display text of the
value; dates also match as `M/D/YYYY` and `yyyy-mm-dd`). Columns with node headers are
searchable too. A search change returns to page 1.

**Sorting**: each sortable header is a button; a click (or Enter) cycles ascending →
descending → unsorted. Empty values sort last in both directions, numbers numerically,
dates by time, text with a natural, case-insensitive collator (`item 2` before `item 10`).
The sort is stable and does not change the page.

## Controlled view state

Search, filters, sort and page can each be controlled (`searchValue`, `filters`, `sort`,
`page`) or left to the table (`defaultSearchValue`, `defaultFilters`, `defaultSort`,
`defaultPage`), in client and server mode alike.

```tsx
const [sort, setSort] = useState<SortState>(null);
const [page, setPage] = useState(1);

<BTTable columns={columns} fetchRows={fetchRows} sort={sort} onSortChange={setSort} page={page} onPageChange={setPage} />;
```

- **Controlled props win.** The table renders the prop and only proposes changes through the
  callback; a parent that ignores a proposal keeps the table where it was (server mode sends no
  request), and the same proposal is made again on the next click. A rejected search is
  reported once; the debounce does not propose it again.
- **Reset rules report too.** A new search, a filter change or a page-size change goes to
  page 1, and so does a search or filters value changed by the parent; each such move calls
  `onPageChange(1)` once. When the parent's own change (search, filters, `pageSize`,
  `resetKey`) moves a controlled page, page 1 shows at once, before the parent answers, so
  server mode asks for page 1 straight away. That held page ends only when the `page` prop
  changes: a sort or filter change made meanwhile keeps page 1, and a page the user moves to
  meanwhile shows and is sent (and proposed through `onPageChange`), so the old page never
  comes back before the parent answers. A reset (`resetKey` or `resetView()`) holds a
  controlled search and filters the same way: the reset values show, and are sent, at once. Page clamping (client: fewer rows; server: a smaller
  reported total) calls `onPageChange` with the last page. `resetKey` calls `onSearchChange`,
  `onFiltersChange` and `onPageChange` with the reset values. A changed `pageSize` prop calls
  `onPageChange(1)`, not `onPageSizeChange`.
- **Search is controlled after the debounce.** The box shows what is typed; `onSearchChange`
  fires once the typing settles, and `searchValue` is the applied term. A new `searchValue`
  from the parent replaces the box text and goes to page 1. An echo does not: the table
  remembers the last 10 values it reported and not yet heard back, so a late echo (a URL
  round trip), even of an older value, never eats keystrokes typed meanwhile or resets the
  page. Filters work the same way. A value the parent chooses itself clears that memory.
- **Echoing is safe.** Callbacks run in event handlers, timers or effects, never during render,
  so `onSortChange={setSort}` is fine. An equal new object counts as no change: `sort={{ key,
  direction }}` inline, or filters rebuilt on every render (array values such as a
  multiselect's compare item by item, so `{ status: params.getAll('status') }` is fine). In
  server mode an echoing parent costs exactly one request per change, and so does a parent
  change under a controlled page.
- **A reset with controlled search, filters or page.** A reset (`resetKey` or `resetView()`)
  is the one exception to "controlled props win": the table reports the reset values and shows
  (and sends) them at once, while the `searchValue`, `filters` and `page` props still hold the
  old ones. Those held props stay under the table's control until the prop changes — the
  echo, or any value you choose — so the table never sends the old values, even after a sort,
  filter or page change made before a late echo. A prop rebuilt on every render with the same
  old value (`filters={{ state: 'tx' }}`) is still the held value, not a change. A parent that
  never echoes leaves the held pieces under table control for good: later typing, filtering and
  paging show, are sent and are reported even though the controlled prop never moves, until
  the parent sets that prop to a new value.
- **`onStateChange`** (client) still reports the applied state and the filtered rows.

## Server mode

The table builds a `Query` from its state and calls your `fetchRows` for each page:

```ts
type Query = {
  page: number; // 1-based
  pageSize: number;
  search: string; // trimmed, '' when empty
  sort: { key: string; direction: 'asc' | 'desc' } | null;
  filters: Record<string, { type: FilterSpec['type']; op?: string; value: unknown }>;
};

type FetchResult<R> = { rows: R[]; totalRows: number; totalFilteredRows?: number };

type FetchRows<R> = (query: Query, ctx: { signal: AbortSignal }) => Promise<FetchResult<R>>;
```

Example query:

```json
{
  "page": 2,
  "pageSize": 100,
  "search": "smith",
  "sort": { "key": "joined", "direction": "desc" },
  "filters": {
    "age": { "type": "number", "op": "range", "value": [18, null] },
    "joined": { "type": "date", "op": "after", "value": "2024-01-31" },
    "role": { "type": "select", "value": "admin" },
    "name": { "type": "text", "op": "contains", "value": "smi" }
  }
}
```

- `filters` holds only **active** filters, keyed by column key, with typed values: text
  trimmed, numbers as numbers, dates as ISO `yyyy-mm-dd` days, date-times as local
  `yyyy-mm-ddThh:mm` minutes (no zone: the browser's clock, as typed), `select` a string,
  `multiselect` a string array, `notEmpty` `true`.
- `op` is always present for `text`, `number`, `date` and `datetime` filters: the column's
  `op`, else the default (`contains`, `eq`, `on`, `on`). `select`, `multiselect` and `notEmpty` have none.
- `totalRows` is the unfiltered count; `totalFilteredRows` (default `totalRows`) is the count
  after search and filters and drives the counter and the page count.

Behaviour:

- **Debounce.** Typing in the search box or in a `text`, `number`, `date` or `datetime` filter waits for
  `searchDebounceMs` of quiet. Page, page size, sort, `select`, `multiselect` and `notEmpty`
  changes are sent at once.
- **Cancellation.** A new request aborts the one in flight through `signal`, and a response
  that arrives after a newer request was sent is ignored even if your fetcher ignores the
  signal. Rejecting with an `AbortError` is not treated as a failure.
- **Loading.** While a request is outstanding the previous rows stay on screen, dimmed, and
  the status strip reads "Loading…".
- **Errors.** When `fetchRows` rejects (or resolves without a `rows` array) the body shows
  "Could not load the rows." with a **Retry** button that sends the same query again. Rows
  and counter stay cleared until a request succeeds: while a retry (or any new query after
  the failure) is loading, the body is empty and the status strip reads "Loading…"; the rows
  of the last success never show under the new query. Returning to the query whose rows were
  last on screen shows them again without a request.
- **Page clamping.** If a response reports fewer pages than the current page, the table moves
  to the last page and fetches it.
- **Missing totals.** Without a valid total the counter counts the rows up to this page, and
  a full page offers one more page after it.
- **Refresh and reset.** A new `fetchRows` identity does not refetch; change `refreshKey` to
  send the current query again (for example after an edit, or when the fetcher captures a new
  tenant id); the scroll position is kept. `resetKey` puts search and filters back to their
  defaults, goes to page 1 and sends one request.
- **Invalid rows.** Entries of `rows` that are `null` or not objects are skipped, with one
  development warning per response.
- **Pagination is always on.** `pagination={false}` is ignored (development warning).
- **Export covers the current page only** unless you pass `fetchAllRows`, and select-all
  selects the current page; see [Export](#export) and [Selection](#selection).

## Manual mode

When the data lives in your own state (a store, a query cache, a websocket feed), let the
parent load the pages: `mode="manual"`. The table never fetches. It calls `onQueryChange` with
the same [`Query`](#server-mode) as server mode, on the same schedule — once at mount, typing
debounced by `searchDebounceMs`, page, sort and the other changes at once, again on
`refreshKey` and `resetKey` — and renders whatever page you pass back.

| Prop | Meaning |
| --- | --- |
| `mode` | `"manual"`. |
| `onQueryChange` | Required. `(query) => void`: load this page. |
| `rows` | The current page: an array or an object map (keys are the id fallback). |
| `totalRows` | Rows before search and filters (the counter's "filtered from"). |
| `totalFilteredRows` | Rows matching search and filters; default `totalRows`. Drives the counter and the page count. |
| `loading` | `true` while the page loads. The page clamp waits for it to be `false`. |

`rows` + `fetchRows`, and `mode="manual"` without `onQueryChange`, are type errors (and render
the error fallback at runtime).

```tsx
type UsersPage = { query: Query | null; rows: User[]; total?: number; filtered?: number; error?: boolean };

function Users() {
  const [query, setQuery] = useState<Query | null>(null);
  const [page, setPage] = useState<UsersPage>({ query: null, rows: [] });
  useEffect(() => {
    if (!query) return;
    let current = true; // false once a newer query (or unmount) replaces this one
    api.users(query).then(
      (result) => current && setPage({ query, rows: result.rows, total: result.total, filtered: result.filtered }),
      // A failure answers the query too, so loading ends.
      () => current && setPage({ query, rows: [], error: true }),
    );
    return () => {
      current = false;
    };
  }, [query]);
  // Loading until the page on screen answers the latest query (and before the first one).
  const loading = query === null || page.query !== query;
  return (
    <BTTable
      columns={columns}
      mode="manual"
      rows={page.rows}
      totalRows={page.total}
      totalFilteredRows={page.filtered}
      loading={loading}
      emptyMessage={page.error ? 'Could not load the users.' : undefined}
      onQueryChange={setQuery}
    />
  );
}
```

Rules shared with server mode:

- **Stale responses are your job.** The table cannot tell which query your rows answer, so it
  cannot drop out-of-order answers: drop a response whose query is no longer the latest, as
  above (or abort it with an `AbortController`). The scroll position resets when new `rows`
  arrive after a query change: the table takes the next rows you pass as the answer to the
  latest query, stale or not. A reset (`resetKey` or `resetView()`) scrolls to the top at
  once, without waiting for new `rows`. Pass `loading` while a page loads, and end it on failure too (store the
  failed query, as above), or the table stays loading.
- **Counter and pages** come from the totals; without a valid total the counter counts the
  rows up to this page, and a full page offers one more page after it. Before the first page
  arrives (`loading` and no rows) the counter is hidden.
- **Page clamping.** When totals that answer the current query (props changed after it was
  emitted, and `loading` is false) report fewer pages than the current page, the table moves
  to the last page: `onPageChange` and `onQueryChange` report it. Totals passed before the
  query (at mount, or before a URL changes page and filters) never clamp it.
- **Pagination is always on** (`pagination={false}` is ignored, development warning),
  select-all selects the current page, selected ids on other pages stay selected, and export
  covers the current page only unless you pass `fetchAllRows`.
- **Controlled view state** works as in the other modes: a parent that ignores a proposed
  change sees no new query.

## Selection

With `selectable`, a checkbox column is added. Each row checkbox is labelled "Select row";
clicking it never triggers the row's own `onClick`. The header box is labelled "Select all",
shows an indeterminate state for a partial selection, and toggles:

- client mode: every **filtered** row (all pages);
- server mode: the rows of the **current page**.

Use `selectedIds` + `onSelectionChange` for controlled selection, or `defaultSelectedIds` for
uncontrolled. In client mode a selected id whose row disappears from `rows` is dropped from
the selection (not when `rows` becomes empty). In server mode ids on other pages are never pruned (those rows are not
loaded), so clear stale ids yourself through a controlled `selectedIds`. Turning `selectable`
off clears the selection: uncontrolled, the table empties it; controlled, it calls
`onSelectionChange([], [])` once.

`onSelectionChange(ids, rows)` also hands you the selected **rows** the table knows, in
selection order: in client mode every selected row (filtered-out ones included); in server and
manual mode the rows of any page seen while they were selected (kept for selected ids only).
An id the table never saw selected — e.g. one set through `selectedIds` for a page not loaded —
has no row.

`renderSelectionBar` puts your bulk actions between the toolbar and the table while at least
one row is selected:

```tsx
<BTTable
  columns={columns}
  rows={rows}
  selectable
  renderSelectionBar={({ selectedIds, selectedRows, clear }) => (
    <>
      {selectedIds.length} selected
      <button onClick={() => archive(selectedRows)}>Archive</button>
      <button onClick={clear}>Clear</button>
    </>
  )}
/>;
```

## Detail rows

`renderDetail` adds a leading toggle column. Each toggle is a real `<button>` named by the
`rowDetails` label, with `aria-expanded`, and `aria-controls` pointing at the detail row while
it is open; clicking it never triggers the row's own `onClick`. An expanded row is followed by
a `tr.btt-detail-row` holding one cell that spans every column (toggle and selection columns
included) with your content. Several rows can be open at once.

```tsx
const renderDetail = useCallback(({ row }: { row: Person }) => <PersonCard person={row} />, []);

<BTTable columns={columns} rows={people} renderDetail={renderDetail} defaultExpandedIds={[7]} />;
```

Use `expandedIds` + `onExpandedChange` to control which rows are open, or
`defaultExpandedIds` for uncontrolled. Expanded ids follow the selection rules: in client mode
an id whose row disappears from `rows` is dropped (not when `rows` becomes empty); in server
and manual mode ids on other pages are kept, so a row is open again when its page comes back.
Removing `renderDetail` closes every row (reported once through `onExpandedChange`).
In server and manual mode rows need real ids (an `id`/`ID`/`INDEX`/`N_ID` field or
`getRowId`), as for selection: with index ids, an open row would open the same position on the
next page. Rows without ids get a development warning.

Detail rows are not data rows: they never get the `btt-row` class, striping, tones,
`rowProps` or `aria-rowindex`, and column widths do not change (the toggle column has a fixed
40 px `<col>`). With virtualization a data row and its detail row are measured as one unit,
so offsets, `scrollToRow` (all alignments fit the row with its open detail) and the mounted
window stay right while details open, close or resize. A row opened or closed while it is
scrolled out of the mounted window (controlled `expandedIds`) uses `estimatedRowHeight` until
it is measured again.

## Export

`exportCsv` adds a CSV button that downloads every filtered, sorted row (server and manual
mode: the rows of the current page, unless `fetchAllRows` is given) as `exportFileName`. The file is UTF-8 with a byte order mark, RFC 4180
(every field quoted, CRLF line ends), and text starting with `=`, `+`, `-`, `@`, tab or
carriage return is prefixed with `'` so spreadsheets do not run it as a formula.

For other formats, list them in `exportFormats` and implement `onExport` with the library of
your choice; the table hands you plain data (same rows as the CSV):

```tsx
type ExportData = { headers: string[]; rows: (string | number)[][] };

<BTTable
  columns={columns}
  rows={rows}
  exportFormats={['pdf']}
  onExport={(format, { headers, rows }) => {
    if (format === 'pdf') makePdf(headers, rows); // pdfmake, jsPDF, …
  }}
/>;
```

In server and manual mode only the current page is loaded, so by default CSV and `onExport`
cover that page. Pass `fetchAllRows` to export every filtered row instead: on click the table
calls it with the current query without `page` and `pageSize` (`ExportQuery`: search, sort,
filters) and exports the rows it resolves to.

```tsx
const fetchAllRows: FetchAllRows<Person> = async (query, { signal }) => {
  const response = await fetch('/api/people/all', { method: 'POST', body: JSON.stringify(query), signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json(); // Person[]
};

<BTTable columns={columns} fetchRows={fetchRows} fetchAllRows={fetchAllRows} exportCsv />;
```

While the rows load, the clicked button has `aria-busy="true"` and the `exportBusy` label, and
the other export buttons are disabled. Clicking it again cancels (the `signal` aborts); so do
a change of search, filters or sort, and unmounting the table. A cancelled or outdated result
is never exported. A failure calls `onError(error, info)` and shows the `exportError` label in
a `role="status"` line next to the buttons, cleared by the next export.

Headers are each column's `headerText`. Cells come from `exportValue` (default `value`):
finite numbers stay numbers, dates become `yyyy-mm-dd` (or a full ISO timestamp when they
carry a time of day), everything else becomes its display text, never a React node.

## Layout, virtualization and performance

- The table always uses `table-layout: fixed` with a `<colgroup>` built from `columns`, a
  `min-width` from the column widths, and one scroll container (`.btt-scroll`) with a sticky
  header. Cell text wraps (`overflow-wrap: anywhere`) instead of widening columns, so column
  widths never depend on which rows are mounted.
- The scroll container reserves its scrollbar space (`scrollbar-gutter: stable`), so a
  scrollbar appearing does not resize columns.
- Virtualization mounts the visible rows plus 8 on each side, between two spacer rows. Row
  heights are measured as rows mount (and on resize, through one `ResizeObserver`) and cached
  by row id, so rows of very different heights scroll smoothly and the view stays anchored
  when rows above it change height.
- The scroll returns to the top only when the **view** changes: page, page size, sort, the
  applied search, filters, or `resetKey`. New data for the same view keeps the reader's
  place: a new `rows` array (polling), new `columns` or `getRowId`, and in server mode a
  `refreshKey` refetch, a Retry or any answer to the same query. In server mode the reset
  happens when the response for the new view arrives; in manual mode, when the next `rows`
  arrive, except a reset (`resetKey` or `resetView()`), which scrolls to the top at once.
- A data row and its open detail row (`renderDetail`) are measured as one unit.

**Keep these props stable** (module-level constants, `useMemo` or `useCallback`):
`columns`, `rows`, `getRowId`, `rowClassName`, `rowProps`, `rowTone`, `renderDetail`. Rows are memoized on their
identity: a new `columns` array or callback re-renders every row, and a new `rows` array or
`getRowId` re-filters, re-sorts and re-derives the whole list on every parent render.

```tsx
const columns = useMemo(() => buildColumns(t), [t]);
const rowProps = useCallback((row: Person) => ({ onClick: () => open(row.id) }), [open]);
```

### Large data (up to 1M rows)

Client mode handles 1,000,000 rows (measured in Chrome and Firefox, see
[docs/benchmarks.md](docs/benchmarks.md)): 60 fps wheel and thumb scrolling, every row
reachable, first render ~0.2–0.3 s.

- **Scroll space is capped at ~15M px** (browsers cap element heights at ~17.9M px in
  Firefox, ~33.5M px in Chrome). Above the cap the scrollbar maps proportionally to the
  rows: small scrolls still move the content pixel for pixel, but at 1M rows one pixel of
  thumb travel spans many rows, so fine positioning is by wheel or keys.
- **End** in the scroll container jumps to the last row and keeps it in view while the rows
  near it are measured (not when typing in an input).
- **Memory:** ~470 MB JS heap at 1M rows in the bench (mostly the rows themselves), plus one
  lowercase search string per row once search is used.
- **First search** builds those strings: ~1.7 s (Chrome) / ~3 s (Firefox) at 1M. Building
  starts in the background when the search box gets focus, so a user who focuses and then
  types rarely waits; later searches take ~110 ms.
- **First sort of a column** ranks its values once: ~0.5 s at 1M; later sorts ~0.2–0.3 s.
- Thumb dragging is measured in Chrome only (headless Firefox draws no scrollbar).

Beyond that (more rows, heavier rows, or slower devices) use [server mode](#server-mode) or
[manual mode](#manual-mode), which only ever hold one page.

## Imperative handle (ref)

```tsx
import { BTTable, type BTTableHandle } from '@kardebadas/bttable';

const table = useRef<BTTableHandle>(null);
<BTTable<Person> ref={table} columns={columns} rows={people} />;

table.current?.scrollToRow(personId, { align: 'center' });
```

The handle has no row type, so `useRef<BTTableHandle>(null)` is all the typing it needs; the
row type `R` is still inferred from `columns` / `rows` (or given as `<BTTable<Person> …>`).
It works with React 18 and 19.

| Method | Meaning |
| --- | --- |
| `scrollToRow(id, { align? })` | Scrolls the row into view below the sticky header; `align` is `'start'` (default), `'center'`, `'end'` or `'nearest'`. A virtualized row that is not mounted yet is mounted first. In client mode a row on another page moves the table to that page (reported through `onPageChange`). Returns `false` when the row is not displayed: filtered out, unknown, or in server and manual mode not on the current page (the table cannot know which page holds it: change `page` yourself, then call it again once that page has loaded). When the row had to be mounted or paged to, the scroll lands after the next render. With a controlled `page`, apply the new page in `onPageChange` itself (set state there, in the same update): a page applied later finds the request already dropped, and the call does nothing. With `maxHeight: 'none'` it calls the row's `scrollIntoView`. |
| `getRowElement(id)` | The row's `<tr>`, or `null` when it is not mounted (another page, or outside the virtual window). |
| `getCellElement(id, columnKey)` | The row's `<td>` for that column, or `null`. |
| `focusCell(id, columnKey)` | `scrollToRow(id, { align: 'nearest' })`, then focuses the cell's first focusable element (link, button, input…), else the cell itself (given `tabIndex=-1`). `false` like `scrollToRow`, or for an unknown column. |
| `clearSelection()` | Unselects every row, reported through `onSelectionChange`. |
| `resetView()` | What a new `resetKey` does: search and filters back to their defaults, page 1, scroll to the top; server and manual mode send the query again. Sort and page size stay. |

The handle is `null` while the table shows its render-error fallback.

## Labels (i18n)

Every UI string can be replaced through `labels` (a partial object). `{name}` placeholders
are filled in by the table; counts are formatted with the `locale` prop (default: the
runtime locale). `DEFAULT_LABELS` (exported, frozen) holds the English defaults.

| Key | Default |
| --- | --- |
| `loading` | `Loading…` |
| `error` | `Something went wrong.` |
| `loadError` | `Could not load the rows.` |
| `retry` | `Retry` |
| `search` | `Search` (accessible name of the search box) |
| `clearSearch` | `Clear search` |
| `counter` | `Showing {from}–{to} of {total}` |
| `counterFiltered` | `(filtered from {total})` |
| `noRecords` | `No records` |
| `counterHelp` | `Search and filters run on the whole dataset; one page is shown at a time.` |
| `counterHelpButton` | `About the counter` |
| `clearAll` | `Clear all` |
| `exportCsv` | `CSV` |
| `exportFormat` | `{format}` (the `exportFormats` name in upper case) |
| `exportBusy` | `Exporting… (cancel)` (the export button while `fetchAllRows` loads) |
| `exportError` | `The export failed.` (status after `fetchAllRows` failed) |
| `pagination` | `Pagination` |
| `previousPage` | `Previous` |
| `nextPage` | `Next` |
| `page` | `Page` |
| `pageOf` | `of {count}` |
| `pageSize` | `Rows per page` |
| `selectAll` | `Select all` |
| `selectRow` | `Select row` |
| `rowDetails` | `Row details` (the detail toggle buttons and their header cell) |
| `filters` | `Filters` |
| `filterAll` | `All` |
| `filterFrom` | `from` |
| `filterTo` | `to` |
| `filterNotEmpty` | `Only non-empty` |
| `multiSelected` | `{count} selected` |
| `searchOptions` | `Search options` |
| `noOptions` | `No options` |

`searchPlaceholder` and `emptyMessage` are separate props.

## Theming

All classes are prefixed `btt-`. Colours, font and radius are CSS custom properties; set them
on `.btt` or on a class you pass as `className`. The defaults have zero specificity, so a
plain rule wins:

```css
.btt {
  --btt-header-bg: #2f3e46;
  --btt-accent: #e76f51;
  --btt-radius: 4px;
}
```

| Variable | Light default | Used for |
| --- | --- | --- |
| `--btt-font` | system UI stack | Font family. |
| `--btt-font-size` | `0.875rem` | Base font size. |
| `--btt-bg` | `#ffffff` | Table, inputs and popover background. |
| `--btt-fg` | `#1d2733` | Text. |
| `--btt-surface` | `#f5f8fb` | Filters panel and buttons. |
| `--btt-border` | `#d8e0e8` | Grid lines and panel borders. |
| `--btt-border-strong` | `#7d8d9c` | Input and button borders (at least 3:1 against the background; dark `#5f6e7d`). |
| `--btt-header-bg` | `#064b8f` | Header background. |
| `--btt-header-fg` | `#ffffff` | Header text and its focus ring. |
| `--btt-row-alt` | `#eef5fc` | Even (alternate) rows. |
| `--btt-row-hover` | `#dcebfa` | Hovered rows and the active multi-select option. |
| `--btt-accent` | `#0b6bcb` | Focus rings, checkboxes, selected rows (tinted). |
| `--btt-danger` | `#c42b1c` | Error text (and a tinted error background). |
| `--btt-muted` | `#5a6876` | Secondary text: counter, labels, status. |
| `--btt-radius` | `6px` | Corner radius. |
| `--btt-tone-<tone>-bg` / `-fg` | e.g. danger `#fde8e6` / `#8c1d12` | Background and text of `rowTone` rows, for `danger`, `warning`, `success`, `info` (dark values too; every pair at least 4.5:1, also against the selected-row tint, which replaces the tone background while the text keeps the tone colour). |

**Dark mode** follows `prefers-color-scheme: dark` by redefining the same variables. To force
one scheme regardless of the system, add `btt-theme-light` or `btt-theme-dark` to
`className`. The `multiselect` popover, portalled out of the table, copies the table's
computed `--btt-*` values and theme class, so your variables apply to it too. Animations (the loading spinner, hover fades) run only when the user has not
asked for reduced motion.

Row striping, hover, row tones, the selected-row tint and the cell grid lines have zero specificity
(`:where()`), so a `rowClassName` or `cellClassName` style of yours wins over them without
`!important`.

Do not give `th`/`td` widths of your own: column widths come from `columns` only.

## Accessibility

- Sortable headers are real `<button>`s inside `<th aria-sort>`; node headers get an
  accessible name from `headerText`.
- Row and select-all checkboxes are labelled ("Select row", "Select all").
- Detail toggles (`renderDetail`) are buttons labelled "Row details" with `aria-expanded`
  and, while open, `aria-controls` naming their detail row; the toggle column's header cell
  carries the same name for screen readers. Detail rows have no `aria-rowindex`.
- An export loading every row (`fetchAllRows`) sets `aria-busy` on its button; a failure is
  announced through a `role="status"` line.
- `aria-busy` is set on the table while loading; the status strip is
  `role="status" aria-live="polite"`. Skeleton rows are hidden from assistive technology,
  and their shimmer runs only without `prefers-reduced-motion: reduce`.
- The server-mode counter's "?" button is described by its `role="tooltip"` bubble
  (`aria-describedby`); it opens on hover and focus and Escape closes it.
- The table sets `aria-rowcount` and every row its `aria-rowindex`, so positions stay right
  when rows are virtualized; spacer rows are hidden from assistive technology. With
  `showTableHeader={false}` no header row is counted (the first body row is 1).
- Pagination is a `<nav aria-label="Pagination">` with real buttons, a labelled page box
  (Enter or blur commits, clamped into range) and a labelled page-size select.
- Every filter has a `<label>` bound to its control. The multi-select is a button
  (`aria-haspopup="listbox"`) showing up to two chosen labels as chips and a "+N" chip for
  the rest; it is named by its label plus a summary ("All", the one label, or "3
  selected"), and the chips are hidden from assistive technology. It opens a search box and
  a `listbox`: ArrowDown on the button opens it and focuses the search box, ArrowDown there
  enters the list, arrows move, Space or Enter toggles, Escape closes and returns focus, a
  click outside closes it. The popover is portalled (`portalContainer`) but keeps the Tab
  order of an in-place one: Shift+Tab from the search box returns to the button, Tab from
  the list closes it and moves on to whatever follows the button.
- `caption` adds a visually hidden table caption.
- Errors are announced with `role="alert"`.

## Server-side rendering

The table renders on the server without `document` or `ResizeObserver`, and without
layout-effect warnings. Numbers in the counter use the runtime locale unless you pass
`locale`: pass a fixed one (e.g. `locale="en-US"`) so the server and the browser render the
same text and hydration does not mismatch. A virtualized table
renders its first rows and a spacer for the rest, sized with `estimatedRowHeight`; real
heights are measured after hydration. Downloads touch `document` only when a button is
clicked. In server mode the first request is sent from an effect, so the server output has
no rows yet.

## Browser support

Current evergreen browsers (Chrome, Edge, Firefox, Safari). Platform features used:
`position: sticky`; `ResizeObserver` (without it, rows are measured when they mount but later
size changes are not tracked); `scrollbar-gutter` (without it, a scrollbar appearing narrows
the columns once); and in the stylesheet `:has()` and `color-mix()` for the selected-row and
error tints (without them, no tint).

## Other exports

Besides `BTTable` and its types (`BTTableProps`, `BTTableClientProps`, `BTTableServerProps`,
`BTTableCommonProps`, `SelectionBarContext`, `Column`, `CellContext`, `FilterSpec`,
`FilterState`, `FilterValue`, `FilterType`, `FilterRowsInput`, `QueryState`, `Option`, `TextOp`, `NumberOp`, `DateOp`, `SortState`, `Query`,
`FetchResult`, `FetchRows`, `FetchAllRows`, `ExportQuery`, `ExportData`, `DetailContext`, `RowId`, `RowSource`, `CellHandler`, `RowAttributes`, `ClientTableState`,
`BTTableHandle`, `RowAlign`, `RowTone`, `RowMount`, `RowUnmount`,
`BTTableLabels`, `VirtualizeMode`), the package exports `DEFAULT_LABELS` and the helpers it
uses itself:

- `compareValues(a, b, direction?)` — the sort comparator.
- `filterRows({ rows, columns, search, filters })` — the rows client mode shows before
  sorting: search and every active filter, in input order.
- `matchesFilter(spec, rowValue, value)` and `isFilterActive(spec, value)` — one column
  filter, as client mode applies it; an inactive filter matches every row.
- `matchesSearch(row, columns, term)` — the global search of one row.
- `buildQuery({ search, filters, sort, page, pageSize }, columns)` — the `Query` server and
  manual mode send for a view state.
- `normalizeFilterType(input)` — a loose filter type name → `FilterType | null`: trimmed,
  lowercased, legacy spellings mapped (`multi_select` / `multi-select` → `multiselect`,
  `textarea` / `string` → `text`, `numeric` → `number`, `not_empty` → `notEmpty`, and the
  legacy `dataType_filterType` pairs such as `date_text` → `date`, `datetime_text` →
  `datetime`, `string_select` → `select`); `null` for anything unknown, blank or not a
  string, never a silent `text`.
- `parseDate(value)` — `Date`, ISO or US date string → `Date | null`, with calendar
  validation.
- `formatValue(value)` — the default cell text.
- `buildExportData(columns, rows)` and `toCsv(data)` — the export pipeline.
- `VERSION`.

## Development

```sh
npm install
npm run demo           # demo app on http://localhost:5199 (client and server tabs)
npm test               # unit tests (Vitest + Testing Library)
npm run test:coverage  # with coverage (80 % line threshold)
npm run check          # typecheck, lint, test, build
```

The stylesheet source is split into `src/styles/theme.css`, `table.css` and `controls.css`;
the build concatenates them, in that order, into the one published `dist/styles.css`.

The demo (`demo/`) is not part of the published package. Its client tab renders 5,000
generated rows of very different heights with every filter type, selection and exports, and
shows a live "Header widths" readout for the no-wobble check; its server tab runs against an
in-memory backend with 300 ms latency, a "Fail next request" button and refresh/reset.

## License

Free for noncommercial use under the
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)
— see [LICENSE.md](LICENSE.md). Commercial use needs a paid license from the author — see
[COMMERCIAL.md](COMMERCIAL.md).
