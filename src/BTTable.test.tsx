import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTTable, type BTTableProps } from './BTTable';
import { tableMinWidth, toCssSize } from './components/ColGroup';
import type { Column, FetchRows } from './core/types';

type Row = { id: number; name: string; age: number | null; note?: unknown };

const ROWS: Row[] = [
  { id: 1, name: 'Ana', age: 30 },
  { id: 2, name: 'Bruno', age: null },
  { id: 3, name: 'Carla', age: 25 },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', width: 120 },
  { key: 'age', header: 'Age', width: '20%', minWidth: 80, align: 'right' },
  { key: 'note', header: <em>Note</em>, headerText: 'Note', sortable: false },
];

function setup(props: Partial<BTTableProps<Row>> = {}) {
  return render(<BTTable columns={COLUMNS} rows={ROWS} {...props} />);
}

const bodyRows = (container: HTMLElement) => Array.from(container.querySelectorAll('tbody tr'));
const firstCells = (container: HTMLElement) => bodyRows(container).map((tr) => tr.querySelector('td')?.textContent);
const table = (container: HTMLElement) => container.querySelector('table') as HTMLTableElement;
const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('mode validation', () => {
  it('renders the error state and reports a clear error when both rows and fetchRows are passed', () => {
    silenceErrors();
    const onError = vi.fn();
    const fetchRows = vi.fn() as unknown as FetchRows<Row>;
    const { container } = setup({ fetchRows, onError });
    expect(container.querySelector('.btt-error')).toHaveAttribute('role', 'alert');
    expect(container.querySelector('table')).toBeNull();
    expect(onError.mock.calls[0][0].message).toMatch(/exactly one of `rows` or `fetchRows`.*both/);
  });

  it('renders the error state when neither is passed', () => {
    silenceErrors();
    const onError = vi.fn();
    const { container } = render(<BTTable columns={COLUMNS} onError={onError} />);
    expect(container.querySelector('.btt-error')).toBeInTheDocument();
    expect(onError.mock.calls[0][0].message).toMatch(/neither/);
  });

  it('renders the table shell with no rows in server mode', () => {
    const fetchRows = vi.fn() as unknown as FetchRows<Row>;
    const { container } = render(<BTTable columns={COLUMNS} fetchRows={fetchRows} />);
    expect(container.querySelectorAll('thead th')).toHaveLength(3);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });
});

describe('layout', () => {
  it('renders the root, the scroll container and a fixed-layout table', () => {
    const { container } = setup({ className: 'mine' });
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('btt', 'mine');
    const scroll = root.querySelector('.btt-scroll') as HTMLElement;
    expect(scroll.style.overflow).toBe('auto');
    expect(scroll.getAttribute('style')).toContain('scrollbar-gutter: stable');
    expect(scroll.style.maxHeight).toBe('600px');
    expect(scroll.querySelector('table')).toHaveClass('btt-table');
    expect(table(container).style.tableLayout).toBe('fixed');
    expect(table(container).style.borderCollapse).toBe('collapse');
    expect(table(container)).toHaveAttribute('aria-rowcount', '4');
    expect(container.querySelector('thead tr')).toHaveAttribute('aria-rowindex', '1');
    expect(bodyRows(container).map((row) => row.getAttribute('aria-rowindex'))).toEqual(['2', '3', '4']);
    expect(table(container).style.width).toBe('100%');
  });

  it('builds the colgroup from column widths and the min-width from px widths or minWidth', () => {
    const { container } = setup();
    const cols = Array.from(container.querySelectorAll('colgroup col')) as HTMLElement[];
    expect(cols.map((col) => col.style.width)).toEqual(['120px', '20%', '']);
    expect(cols[2]).not.toHaveAttribute('style');
    expect(table(container).style.minWidth).toBe(`${120 + 80 + 60}px`);
  });

  it('keeps the colgroup identical for two different row sets', () => {
    const longRows: Row[] = Array.from({ length: 50 }, (_, i) => ({
      id: i + 10,
      name: 'A very long name that would widen an auto-layout column '.repeat(i % 5 + 1),
      age: i * 1000,
      note: <strong>{'x'.repeat(200)}</strong>,
    }));
    const { container, rerender } = setup();
    const before = container.querySelector('colgroup')?.outerHTML;
    const tableStyle = table(container).getAttribute('style');
    rerender(<BTTable columns={COLUMNS} rows={longRows} />);
    expect(bodyRows(container)).toHaveLength(50);
    expect(container.querySelector('colgroup')?.outerHTML).toBe(before);
    expect(table(container).getAttribute('style')).toBe(tableStyle);
    const other = render(<BTTable columns={COLUMNS} rows={[]} />);
    expect(other.container.querySelector('colgroup')?.outerHTML).toBe(before);
  });

  it('adds a fixed-width selection column and empty slots when selectable', () => {
    const { container } = setup({ selectable: true });
    const cols = Array.from(container.querySelectorAll('colgroup col')) as HTMLElement[];
    expect(cols).toHaveLength(4);
    expect(cols[0].style.width).toBe('40px');
    expect(table(container).style.minWidth).toBe(`${40 + 120 + 80 + 60}px`);
    expect(container.querySelectorAll('thead th')).toHaveLength(4);
    expect(bodyRows(container)[0].querySelectorAll('td')).toHaveLength(4);
  });

  it('makes the thead sticky', () => {
    const { container } = setup();
    const thead = container.querySelector('thead') as HTMLElement;
    expect(thead.style.position).toBe('sticky');
    expect(thead.style.top).toBe('0px');
  });

  it('accepts maxHeight as a number, a CSS string or none', () => {
    const scroll = (props: Partial<BTTableProps<Row>>) =>
      (setup(props).container.querySelector('.btt-scroll') as HTMLElement).style.maxHeight;
    expect(scroll({ maxHeight: 300 })).toBe('300px');
    expect(scroll({ maxHeight: '50vh' })).toBe('50vh');
    expect(scroll({ maxHeight: 'none' })).toBe('none');
  });

  it('exposes the width helpers as pure functions', () => {
    expect(toCssSize(10)).toBe('10px');
    expect(toCssSize('3em')).toBe('3em');
    expect(toCssSize(undefined)).toBeUndefined();
    expect(tableMinWidth(COLUMNS, false)).toBe(260);
  });

  it('renders a caption when given', () => {
    const { container } = setup({ caption: 'People' });
    expect(container.querySelector('caption')).toHaveTextContent('People');
  });
});

describe('sorting', () => {
  it('cycles asc → desc → none through the header button and sets aria-sort', () => {
    const { container } = setup();
    const th = screen.getByRole('columnheader', { name: 'Name' });
    const button = within(th).getByRole('button');
    expect(button).toHaveClass('btt-sort');
    expect(th).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(button);
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(firstCells(container)).toEqual(['Ana', 'Bruno', 'Carla']);
    fireEvent.click(button);
    expect(th).toHaveAttribute('aria-sort', 'descending');
    expect(firstCells(container)).toEqual(['Carla', 'Bruno', 'Ana']);
    fireEvent.click(button);
    expect(th).toHaveAttribute('aria-sort', 'none');
  });

  it('names a node header from headerText, else its key', () => {
    const columns: Column<Row>[] = [
      { key: 'status', header: <svg />, headerText: 'Status' },
      { key: 'flag', header: <svg />, sortable: false },
      { key: 'name', header: 'Name' },
    ];
    render(<BTTable columns={columns} rows={ROWS} />);
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'flag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Name' })).not.toHaveAttribute('aria-label');
  });

  it('renders no button and no aria-sort when sortable is false', () => {
    setup();
    const th = screen.getByRole('columnheader', { name: 'Note' });
    expect(within(th).queryByRole('button')).toBeNull();
    expect(th).not.toHaveAttribute('aria-sort');
    expect(th.querySelector('em')).toBeInTheDocument();
  });

  it('applies headerClassName and the align class to the header', () => {
    render(<BTTable columns={[{ key: 'age', header: 'Age', align: 'center', headerClassName: 'h' }]} rows={ROWS} />);
    expect(screen.getByRole('columnheader')).toHaveClass('btt-th', 'btt-align-center', 'h');
  });
});

describe('rows and cells', () => {
  it('renders cells with render, align and cellClassName', () => {
    const columns: Column<Row>[] = [
      { key: 'name', header: 'Name', cellClassName: 'c-name' },
      {
        key: 'age',
        header: 'Age',
        align: 'right',
        cellClassName: (row) => (row.age === null ? 'missing' : undefined),
        render: ({ value, rowIndex, column }) => `${column.key}:${String(value)}@${rowIndex}`,
      },
    ];
    const { container } = render(<BTTable columns={columns} rows={ROWS} />);
    const cells = bodyRows(container)[1].querySelectorAll('td');
    expect(cells[0]).toHaveClass('btt-cell', 'c-name');
    expect(cells[1]).toHaveClass('btt-cell', 'btt-align-right', 'missing');
    expect(cells[1]).toHaveTextContent('age:null@1');
    expect(bodyRows(container)[0].querySelectorAll('td')[1]).not.toHaveClass('missing');
  });

  it('formats raw values and renders element values as elements', () => {
    const rows: Row[] = [{ id: 1, name: 'Ana', age: null, note: <a href="#x">link</a> }];
    const { container } = render(<BTTable columns={COLUMNS} rows={rows} />);
    const cells = bodyRows(container)[0].querySelectorAll('td');
    expect(cells[1]).toHaveTextContent('');
    expect(cells[2].querySelector('a')).toHaveAttribute('href', '#x');
  });

  it('applies odd/even classes, rowClassName and rowProps with the row index', () => {
    const onClick = vi.fn();
    const { container } = setup({
      rowClassName: (row, index) => `r-${row.id}-${index}`,
      rowProps: (row) => ({ 'data-testid': `row-${row.id}`, className: 'extra', onClick }),
    });
    const rows = bodyRows(container);
    expect(rows[0]).toHaveClass('btt-row', 'btt-row--odd', 'r-1-0', 'extra');
    expect(rows[1]).toHaveClass('btt-row', 'btt-row--even', 'r-2-1');
    fireEvent.click(screen.getByTestId('row-3'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not warn about invalid rows in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setup({ rows: [null] as unknown as Row[] });
    vi.unstubAllEnvs();
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips invalid rows with one dev warning per rows change', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [null, ROWS[0], 'x', ROWS[1]] as unknown as Row[];
    const { container, rerender } = setup({ rows });
    expect(bodyRows(container)).toHaveLength(2);
    rerender(<BTTable columns={COLUMNS} rows={rows} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/skipped 2 invalid rows/);
  });

  it('shows emptyMessage when there are no rows', () => {
    const { container } = setup({ rows: [], emptyMessage: <b>Nothing here</b> });
    const td = container.querySelector('td.btt-empty') as HTMLTableCellElement;
    expect(td).toHaveTextContent('Nothing here');
    expect(td.colSpan).toBe(3);
  });
});

describe('loading', () => {
  it('keeps rows mounted and shows the status strip while loading', () => {
    const { container, rerender } = setup();
    const status = screen.getByRole('status');
    expect(status).toHaveClass('btt-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
    expect(status.style.minHeight).toBe('1.5em');
    const firstRow = bodyRows(container)[0];
    rerender(<BTTable columns={COLUMNS} rows={ROWS} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(bodyRows(container)[0]).toBe(firstRow);
    expect(table(container)).toHaveAttribute('aria-busy', 'true');
  });

  it('does not re-render rows whose entries did not change', () => {
    const render1 = vi.fn(({ value }) => String(value));
    const columns: Column<Row>[] = [{ key: 'name', header: 'Name', render: render1 }];
    const { rerender } = render(<BTTable columns={columns} rows={ROWS} />);
    expect(render1).toHaveBeenCalledTimes(3);
    rerender(<BTTable columns={columns} rows={ROWS} loading />);
    expect(render1).toHaveBeenCalledTimes(3);
  });

  it('does not show the empty message while loading', () => {
    const { container } = setup({ rows: [], loading: true });
    expect(container.querySelector('.btt-empty')).toBeNull();
  });
});

describe('errors and labels', () => {
  const throwing: Column<Row>[] = [
    { key: 'name', header: 'Name' },
    {
      key: 'age',
      header: 'Age',
      render: ({ row }) => {
        if (row.id === 2) throw new Error('bad cell');
        return 'ok';
      },
    },
  ];

  it('catches a throwing cell render, keeps the header and calls onError', () => {
    silenceErrors();
    const onError = vi.fn();
    const { container } = render(<BTTable columns={throwing} rows={ROWS} onError={onError} />);
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    const fallback = container.querySelector('tbody td.btt-error') as HTMLTableCellElement;
    expect(fallback).toHaveTextContent('Something went wrong.');
    expect(fallback.colSpan).toBe(2);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad cell' }), expect.anything());
  });

  it('reports a cell that starts throwing after an update exactly once', () => {
    silenceErrors();
    const onError = vi.fn();
    const { container, rerender } = render(<BTTable columns={throwing} rows={[ROWS[0]]} onError={onError} />);
    expect(onError).not.toHaveBeenCalled();
    rerender(<BTTable columns={throwing} rows={ROWS} onError={onError} />);
    expect(container.querySelector('tbody .btt-error')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('recovers from a missing source once rows arrive', () => {
    silenceErrors();
    const { container, rerender } = render(<BTTable columns={COLUMNS} rows={undefined} />);
    expect(container.querySelector('.btt-error')).toBeInTheDocument();
    rerender(<BTTable columns={COLUMNS} rows={ROWS} />);
    expect(container.querySelector('.btt-error')).toBeNull();
    expect(bodyRows(container)).toHaveLength(3);
  });

  it('recovers when the rows change', () => {
    silenceErrors();
    const { container, rerender } = render(<BTTable columns={throwing} rows={ROWS} />);
    rerender(<BTTable columns={throwing} rows={[ROWS[0]]} />);
    expect(container.querySelector('.btt-error')).toBeNull();
    expect(bodyRows(container)).toHaveLength(1);
  });

  it('lets labels override the UI strings', () => {
    silenceErrors();
    render(<BTTable columns={throwing} rows={ROWS} loading labels={{ loading: 'Carregando', error: 'Erro' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando');
    expect(screen.getByRole('alert')).toHaveTextContent('Erro');
  });
});
