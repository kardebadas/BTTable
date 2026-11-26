import { useRef, useState } from 'react';
import { BTTable, type ExportData, type RowId } from '../src';
import { COLUMNS, type DemoRow, generateRows } from './data';
import { HeaderWidths } from './HeaderWidths';

const ROWS = generateRows(5_000, 42);
const EXPORT_FORMATS = ['json'];

/** Saves the export payload as a JSON file of objects keyed by header. */
function downloadJson(format: string, data: ExportData): void {
  const records = data.rows.map((cells) => Object.fromEntries(data.headers.map((header, index) => [header, cells[index]])));
  const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bttable-demo.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The detail row of a demo record: its full notes and tags. */
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

/** Client mode: 5,000 in-memory rows of varied height, every filter type, selection, detail rows and exports. */
export function ClientDemo({ themeClass }: { themeClass?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [paginate, setPaginate] = useState(false);
  const [selected, setSelected] = useState<RowId[]>([]);
  return (
    <section className="demo-panel">
      <div className="demo-bar">
        <label>
          <input type="checkbox" checked={paginate} onChange={(event) => setPaginate(event.target.checked)} /> Paginate
          (off: all 5,000 rows in one virtualized scroll)
        </label>
        <HeaderWidths target={wrapRef} />
      </div>
      <div ref={wrapRef}>
        <BTTable
          columns={COLUMNS}
          rows={ROWS}
          pagination={paginate}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          renderDetail={renderDetail}
          exportCsv
          exportFileName="bttable-demo.csv"
          exportFormats={EXPORT_FORMATS}
          onExport={downloadJson}
          toolbarExtras={<span className="demo-selected">{selected.length} selected</span>}
          caption="Generated client rows"
          className={themeClass}
          maxHeight={560}
        />
      </div>
    </section>
  );
}
