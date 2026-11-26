import { useState } from 'react';
import { BTTable, type CellContext, type Column, type RowTone, type SelectionBarContext } from '../../src';
import { COLUMNS, type DemoRow, generateRows } from '../data';
import { type CardGroup, useDemoTheme } from './cardKit';
import source from './rowFeatures.tsx?raw';

const ROWS = generateRows(300, 5);

// #region selection
// Keep it stable (module level or useCallback).
function renderSelectionBar({ selectedIds, selectedRows, clear }: SelectionBarContext<DemoRow>) {
  const total = selectedRows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <>
      <strong>{selectedIds.length} selected</strong>
      <span>Total ${total.toFixed(2)}</span>
      <button type="button" onClick={clear}>Clear</button>
    </>
  );
}

function SelectionTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={COLUMNS}
      rows={ROWS}
      selectable
      defaultSelectedIds={[1, 3]}
      renderSelectionBar={renderSelectionBar}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region detail
function renderDetail({ row }: { row: DemoRow }) {
  return (
    <dl className="demo-detail">
      <dt>Notes</dt>
      <dd>{row.notes}</dd>
      <dt>Tags</dt>
      <dd>{row.tags.join(', ') || '—'}</dd>
    </dl>
  );
}

function DetailTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={COLUMNS}
      rows={ROWS}
      renderDetail={renderDetail}
      defaultExpandedIds={[2]}
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

// #region tones-cells
const TONES: Record<string, RowTone> = { Active: 'success', Pending: 'warning', Blocked: 'danger', Archived: 'info' };
const toneOf = (row: DemoRow) => TONES[row.status];

// A real component (hooks allowed), with extra props from `cellProps`.
function NoteCell({ row, placeholder }: CellContext<DemoRow> & { placeholder?: string }) {
  return <input aria-label={`Note for ${row.name}`} placeholder={placeholder} defaultValue="" />;
}

/** Columns whose cell handlers report to `log`; built once per table with useState. */
function toneColumns(log: (text: string) => void): Column<DemoRow>[] {
  return [
    { key: 'id', header: 'ID', width: 60, align: 'right' },
    { key: 'name', header: 'Name (click)', width: 150, onCellClick: (_event, { row }) => log(`clicked ${row.name}`) },
    { key: 'status', header: 'Status', width: 100 },
    { key: 'amount', header: 'Amount', width: 110, align: 'right', colClassName: 'demo-col-highlight' },
    {
      key: 'note',
      header: 'Note (type, then leave)',
      minWidth: 180,
      sortable: false,
      cell: NoteCell,
      cellProps: { placeholder: 'Type a note' },
      onCellChange: (event, { row }) => log(`row ${row.id}: "${(event.target as HTMLInputElement).value}"`),
      onCellBlur: (_event, { row }) => log(`left row ${row.id}`),
    },
  ];
}

function TonesAndCells() {
  const theme = useDemoTheme(); // demo theme
  const [last, setLast] = useState('Click a name or type a note.');
  const [columns] = useState(() => toneColumns(setLast));
  return (
    <>
      <p className="demo-log" role="status">{last}</p>
      <BTTable
        columns={columns}
        rows={ROWS}
        rowTone={toneOf}
        tableClassName="demo-compact"
        search={false}
        pageSize={10}
        className={theme} // demo theme
      />
    </>
  );
}
// #endregion

export const ROW_FEATURES: CardGroup = {
  title: 'Rows and cells',
  source,
  cards: [
    { id: 'selection', title: 'Selection and selection bar', when: 'Bulk actions on chosen rows: a bar appears while any row is selected.', Demo: SelectionTable },
    { id: 'detail', title: 'Expandable detail rows', when: 'Long or secondary data shown under a row on demand.', Demo: DetailTable },
    {
      id: 'tones-cells',
      title: 'Row tones, cell components, cell handlers, classes',
      when: 'Status colours, interactive cells, per-cell events, and styling hooks (colClassName outlines Amount, tableClassName for compact rows).',
      Demo: TonesAndCells,
    },
  ],
};
