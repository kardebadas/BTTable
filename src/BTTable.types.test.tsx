import { describe, expect, it } from 'vitest';
import { BTTable } from './BTTable';
import type { Column, FetchRows } from './core/types';

type Row = { id: number; name: string };
const COLUMNS: Column<Row>[] = [{ key: 'name', header: 'Name' }];
const ROWS: Row[] = [{ id: 1, name: 'Ana' }];
const fetchRows: FetchRows<Row> = async () => ({ rows: ROWS, totalRows: 1 });

// Type-level tests, enforced by `npm run typecheck`: an unused @ts-expect-error fails it.
// The elements are only created, never rendered.
describe('BTTableProps', () => {
  it('accepts exactly one data source and rejects both or neither at compile time', () => {
    const client = <BTTable columns={COLUMNS} rows={ROWS} />;
    const server = <BTTable columns={COLUMNS} fetchRows={fetchRows} />;
    // @ts-expect-error -- both rows and fetchRows
    const both = <BTTable columns={COLUMNS} rows={ROWS} fetchRows={fetchRows} />;
    // @ts-expect-error -- neither rows nor fetchRows
    const neither = <BTTable columns={COLUMNS} />;
    expect([client, server, both, neither]).toHaveLength(4);
  });

  it('accepts rows as an object map of the column row type', () => {
    const map = <BTTable columns={COLUMNS} rows={{ a: ROWS[0] }} />;
    // @ts-expect-error -- map values must be rows
    const wrong = <BTTable columns={COLUMNS} rows={{ a: 1 }} />;
    expect([map, wrong]).toHaveLength(2);
  });
});
