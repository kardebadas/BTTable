import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import type { CellContext, Column } from './core/types';
import { buildEntries } from './hooks/rowModel';

type Row = { id?: number; name: string };

const COLUMNS: Column<Row>[] = [{ key: 'name', header: 'Name', width: 120 }];
const ROWS: Row[] = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Bruno' },
];

function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  return render(<BTTable columns={COLUMNS} rows={ROWS} {...props} />);
}

const bodyRows = (container: HTMLElement) => Array.from(container.querySelectorAll('tbody tr.btt-row'));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('rows as an object map', () => {
  it('renders the values in property order, using the key as the id fallback', () => {
    const onSelectionChange = vi.fn();
    const rows = { b: { name: 'Bruno' }, a: { id: 7, name: 'Ana' }, c: { name: 'Carla' } };
    const { container } = setup({ rows, selectable: true, onSelectionChange });
    expect(bodyRows(container).map((row) => row.textContent)).toEqual(['Bruno', 'Ana', 'Carla']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['b', 7, 'c']);
  });

  it('passes the map position to getRowId and rowClassName', () => {
    const getRowId = vi.fn((row: Row, index: number) => `${row.name}-${index}`);
    const rowClassName = (_row: Row, index: number) => `pos-${index}`;
    const { container } = setup({ rows: { x: { name: 'Ana' }, y: { name: 'Bruno' } }, getRowId, rowClassName });
    expect(getRowId.mock.calls.map((call) => call[1])).toEqual([0, 1]);
    expect(bodyRows(container)[1]).toHaveClass('pos-1');
  });

  it('warns about invalid map values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = { a: { name: 'Ana' }, b: null } as unknown as Record<string, Row>;
    const { container } = setup({ rows });
    expect(bodyRows(container)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith('BTTable: skipped 1 invalid rows (null or not an object).');
  });

  it('builds entries with own id → key → index, and arrays keep the index fallback', () => {
    const fromMap = buildEntries<Row>({ k: { name: 'a' }, j: { id: 3, name: 'b' } });
    expect(fromMap.map((entry) => [entry.id, entry.index])).toEqual([['k', 0], [3, 1]]);
    expect(buildEntries<Row>([{ name: 'a' }, { name: 'b' }]).map((entry) => entry.id)).toEqual([0, 1]);
  });
});

describe('showTableHeader', () => {
  it('renders no thead when false, keeping the colgroup widths and the row checkboxes', () => {
    const { container } = setup({ showTableHeader: false, selectable: true });
    expect(container.querySelector('thead')).toBeNull();
    expect(container.querySelectorAll('col')[1]).toHaveStyle({ width: '120px' });
    expect(screen.queryByRole('checkbox', { name: 'Select all' })).toBeNull();
    expect(screen.getAllByRole('checkbox', { name: 'Select row' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Name' })).toBeNull();
  });

  it('counts no header row in aria-rowcount and aria-rowindex', () => {
    const { container } = setup({ showTableHeader: false });
    expect(container.querySelector('table')).toHaveAttribute('aria-rowcount', '2');
    expect(bodyRows(container).map((row) => row.getAttribute('aria-rowindex'))).toEqual(['1', '2']);
  });

  it('renders the header by default', () => {
    const { container } = setup();
    expect(container.querySelector('thead')).not.toBeNull();
  });
});

describe('element class names', () => {
  it('appends tableClassName, theadClassName and tbodyClassName to the package classes', () => {
    const { container } = setup({ tableClassName: 't', theadClassName: 'h', tbodyClassName: 'b' });
    expect(container.querySelector('table')).toHaveClass('btt-table', 't');
    expect(container.querySelector('thead')).toHaveClass('btt-thead', 'h');
    expect(container.querySelector('tbody')).toHaveClass('b');
  });

  it('keeps tbodyClassName on the empty body', () => {
    const { container } = setup({ rows: [], tbodyClassName: 'b' });
    expect(container.querySelector('tbody')).toHaveClass('b');
  });

  it('keeps tbodyClassName on the error body', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const columns: Column<Row>[] = [{ key: 'name', header: 'Name', render: () => { throw new Error('boom'); } }];
    const { container } = setup({ columns, tbodyClassName: 'b' });
    expect(container.querySelector('tbody')).toHaveClass('b');
    expect(container.querySelector('tbody .btt-error')).not.toBeNull();
  });
});

describe('per-cell event handlers', () => {
  const lastCtx = (handler: ReturnType<typeof vi.fn>) => handler.mock.lastCall?.[1] as CellContext<Row>;

  it('calls onCellClick with the event and the cell context, including rowId', () => {
    let target = '';
    const onCellClick = vi.fn((event: { currentTarget: HTMLElement }) => {
      target = event.currentTarget.tagName;
    });
    setup({ columns: [{ key: 'name', header: 'Name', onCellClick }] });
    fireEvent.click(screen.getByText('Bruno'));
    const ctx = lastCtx(onCellClick);
    expect(target).toBe('TD');
    expect(ctx).toMatchObject({ row: ROWS[1], value: 'Bruno', rowIndex: 1, rowId: 2 });
    expect(ctx.column.key).toBe('name');
  });

  it('calls onCellChange and onCellBlur for events bubbling from an input in the cell', () => {
    const onCellChange = vi.fn();
    const onCellBlur = vi.fn();
    const render = ({ value }: CellContext<Row>) => <input aria-label="edit" defaultValue={String(value)} />;
    setup({ rows: [ROWS[0]], columns: [{ key: 'name', header: 'Name', render, onCellChange, onCellBlur }] });
    const input = screen.getByRole('textbox', { name: 'edit' });
    fireEvent.change(input, { target: { value: 'Anna' } });
    fireEvent.blur(input);
    expect((onCellChange.mock.lastCall?.[0].target as HTMLInputElement).value).toBe('Anna');
    expect(lastCtx(onCellChange).rowId).toBe(1);
    expect(lastCtx(onCellBlur).row).toBe(ROWS[0]);
  });

  it('passes rowId to render', () => {
    const render = ({ rowId }: CellContext<Row>) => `#${rowId}`;
    setup({ columns: [{ key: 'name', header: 'Name', render }] });
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('calls onCellClick once, with the right context, in a row that has its own onClick', () => {
    const onCellClick = vi.fn();
    const onRowClick = vi.fn();
    const rowProps = () => ({ onClick: onRowClick });
    setup({ rowProps, columns: [{ key: 'name', header: 'Name', onCellClick }] });
    fireEvent.click(screen.getByText('Ana'));
    expect(onCellClick).toHaveBeenCalledTimes(1);
    const [event, ctx] = onCellClick.mock.calls[0] as [{ type: string }, CellContext<Row>];
    expect(event.type).toBe('click');
    expect(ctx.rowId).toBe(1);
    expect(ctx.column.key).toBe('name');
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('keeps rows memoized when the columns with handlers are stable', () => {
    const cellRender = vi.fn(({ value }: CellContext<Row>) => String(value));
    const columns: Column<Row>[] = [{ key: 'name', header: 'Name', render: cellRender, onCellClick: () => {} }];
    const { rerender } = setup({ columns });
    expect(cellRender).toHaveBeenCalledTimes(2);
    rerender(<BTTable columns={columns} rows={ROWS} emptyMessage="changed" />);
    expect(cellRender).toHaveBeenCalledTimes(2);
  });
});
