import { useState } from 'react';
import { BTTable, type BTTableLabels, type Column } from '../../src';
import { COLUMNS, generateRows } from '../data';
import { type CardGroup, useDemoTheme } from './cardKit';
import source from './scale.tsx?raw';

const ROWS = generateRows(300, 9);

// #region million
type BigRow = { id: number; name: string; city: string; amount: number };

const CITIES = ['Lisbon', 'Porto', 'Braga', 'Coimbra', 'Faro', 'Aveiro', 'Évora'];
const BIG_COLUMNS: Column<BigRow>[] = [
  { key: 'id', header: 'ID', width: 100, align: 'right' },
  { key: 'name', header: 'Name', width: 160 },
  { key: 'city', header: 'City', width: 120, filter: { type: 'select', options: CITIES.map((city) => ({ value: city, label: city })) } },
  { key: 'amount', header: 'Amount', width: 120, align: 'right', filter: { type: 'number', op: 'range' } },
];

function makeRows(count: number): BigRow[] {
  const rows: BigRow[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    rows[index] = { id: index + 1, name: `Person ${index + 1}`, city: CITIES[index % CITIES.length], amount: ((index * 7919) % 100_000) / 100 };
  }
  return rows;
}

function MillionRows() {
  const theme = useDemoTheme(); // demo theme
  const [data, setData] = useState<{ rows: BigRow[]; ms: number } | null>(null);
  const generate = () => {
    const start = performance.now();
    const rows = makeRows(1_000_000);
    setData({ rows, ms: performance.now() - start });
  };
  return (
    <>
      <div className="demo-bar">
        <button type="button" onClick={generate}>{data ? 'Generate again' : 'Generate 1,000,000 rows'}</button>
        {data && <span role="status">Generated {data.rows.length.toLocaleString('en-US')} rows in {Math.round(data.ms)} ms.</span>}
      </div>
      {data && (
        <BTTable
          columns={BIG_COLUMNS}
          rows={data.rows}
          pagination={false}
          maxHeight={400}
          className={theme} // demo theme
        />
      )}
    </>
  );
}
// #endregion

// #region dark
// btt-theme-dark (or btt-theme-light) forces a scheme; without it the table follows the system.
function DarkTable() {
  return <BTTable columns={COLUMNS} rows={ROWS} className="btt-theme-dark" pageSize={10} />;
}
// #endregion

// #region labels
// Any subset of the strings; the rest stay English. Numbers follow `locale`.
const PT_LABELS: Partial<BTTableLabels> = {
  search: 'Pesquisar',
  clearSearch: 'Limpar pesquisa',
  counter: 'A mostrar {from}–{to} de {total}',
  counterFiltered: '(filtrado de {total})',
  noRecords: 'Sem registos',
  clearAll: 'Limpar tudo',
  previousPage: 'Anterior',
  nextPage: 'Seguinte',
  page: 'Página',
  pageOf: 'de {count}',
  pageSize: 'Linhas por página',
  filters: 'Filtros',
  filterAll: 'Todos',
  filterFrom: 'de',
  filterTo: 'até',
  filterNotEmpty: 'Só preenchidos',
  multiSelected: '{count} selecionados',
  searchOptions: 'Pesquisar opções',
  noOptions: 'Sem opções',
};

function PortugueseTable() {
  const theme = useDemoTheme(); // demo theme
  return (
    <BTTable
      columns={COLUMNS}
      rows={ROWS}
      labels={PT_LABELS}
      locale="pt-PT"
      searchPlaceholder="Pesquisar…"
      emptyMessage="Nenhum registo encontrado"
      pageSize={10}
      className={theme} // demo theme
    />
  );
}
// #endregion

export const SCALE: CardGroup = {
  title: 'Scale, theme and language',
  source,
  cards: [
    { id: 'million', title: '1,000,000 rows (client mode)', when: 'Big in-memory datasets: rows are generated on the click, not on page load.', Demo: MillionRows },
    { id: 'dark', title: 'Dark theme', when: 'Force dark (or light) on one table whatever the system setting.', Demo: DarkTable },
    { id: 'labels', title: 'Labels (Portuguese)', when: 'Translate every UI string; column headers are yours already.', Demo: PortugueseTable },
  ],
};
