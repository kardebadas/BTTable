import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, forwardRef, memo, useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import { buildExportData } from './core/export';
import { matchesSearch } from './core/search';
import type { CellContext, Column } from './core/types';
import { hasConflictingIds } from './core/values';

type Row = { id: number; name: string; tags?: unknown };

const ROWS: Row[] = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Bruno' },
];
const NAME: Column<Row> = { key: 'name', header: 'Name', width: 120 };

function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  return render(<BTTable columns={[NAME]} rows={ROWS} {...props} />);
}

const bodyRows = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr.btt-row'));
const firstCell = (container: HTMLElement) => bodyRows(container)[0].cells[0];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('colClassName', () => {
  it('puts the class on the column <col>, keeping the width', () => {
    const { container } = setup({ columns: [{ ...NAME, colClassName: 'col-name' }, { key: 'id', header: 'Id' }] });
    const cols = container.querySelectorAll('col');
    expect(cols[0]).toHaveClass('col-name');
    expect(cols[0].style.width).toBe('120px');
    expect(cols[1].className).toBe('');
  });
});

describe('arrays of nodes', () => {
  const TAGS: Column<Row> = { key: 'tags', header: 'Tags' };

  it('renders an array holding elements as a fragment, other items as text', () => {
    const rows = [{ id: 1, name: 'Ana', tags: [<b key="a">bold</b>, ' and ', 3, <i key="b">it</i>] }];
    const { container } = setup({ columns: [TAGS], rows });
    const cell = firstCell(container);
    expect(cell.innerHTML).toBe('<b>bold</b> and 3<i>it</i>');
  });

  it('still joins arrays of primitives with ", "', () => {
    const { container } = setup({ columns: [TAGS], rows: [{ id: 1, name: 'Ana', tags: ['x', 'y', 2] }] });
    expect(firstCell(container).textContent).toBe('x, y, 2');
  });

  it('exports and searches the text of the nodes', () => {
    const row = { id: 1, name: 'Ana', tags: [<b key="a">bold</b>, 'plain'] };
    expect(buildExportData([TAGS], [row]).rows).toEqual([['bold, plain']]);
    expect(matchesSearch(row, [TAGS], 'plain')).toBe(true);
  });
});

describe('cell components', () => {
  it('renders a component with hooks, the context as props and cellProps under it', () => {
    function Counter({ row, rowId, label, name }: CellContext<Row> & { label?: string; name?: string }) {
      const [clicks, setClicks] = useState(0);
      return (
        <button type="button" onClick={() => setClicks(clicks + 1)}>
          {`${label}:${row.name}:${rowId}:${clicks}:${name}`}
        </button>
      );
    }
    // `row` in cellProps loses to the context's `row`.
    const column: Column<Row> = { ...NAME, cell: Counter, cellProps: (row) => ({ label: 'L', name: row.name.toUpperCase(), row: null }) };
    setup({ columns: [column] });
    fireEvent.click(screen.getByText('L:Ana:1:0:ANA'));
    expect(screen.getByText('L:Ana:1:1:ANA')).toBeInTheDocument();
  });

  it('drops key and ref from cellProps', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Keys = (props: CellContext<Row>) => <span>{Object.keys(props).sort().join(',')}</span>;
    const column: Column<Row> = { ...NAME, cell: Keys, cellProps: { key: 'k', ref: createRef(), extra: 1 } };
    const { container } = setup({ columns: [column] });
    expect(firstCell(container).textContent).toBe('column,extra,row,rowId,rowIndex,value');
    expect(error).not.toHaveBeenCalled();
  });

  it('takes a static cellProps object and wins over render', () => {
    const Tag = ({ value, tone }: CellContext<Row> & { tone?: string }) => <span data-tone={tone}>{String(value)}</span>;
    const column: Column<Row> = { ...NAME, cell: Tag, cellProps: { tone: 'info' }, render: () => 'render' };
    const { container } = setup({ columns: [column] });
    expect(firstCell(container).innerHTML).toBe('<span data-tone="info">Ana</span>');
  });

  it('accepts memo and forwardRef components', () => {
    const Memo = memo(({ value }: CellContext<Row>) => <em>{String(value)}</em>);
    const Forwarded = forwardRef<HTMLElement, CellContext<Row>>(({ rowId }, ref) => <strong ref={ref}>{rowId}</strong>);
    const { container } = setup({ columns: [{ ...NAME, cell: Memo }, { key: 'id', header: 'Id', cell: Forwarded }] });
    expect(bodyRows(container)[1].innerHTML).toContain('<em>Bruno</em>');
    expect(bodyRows(container)[1].innerHTML).toContain('<strong>2</strong>');
  });

  it('runs the effects of a cell component with cleanup', () => {
    const log: string[] = [];
    function Effectful({ rowId }: CellContext<Row>) {
      useEffect(() => {
        log.push(`mount ${rowId}`);
        return () => {
          log.push(`unmount ${rowId}`);
        };
      }, [rowId]);
      return null;
    }
    const view = setup({ columns: [{ ...NAME, cell: Effectful }] });
    view.unmount();
    expect(log).toEqual(['mount 1', 'mount 2', 'unmount 1', 'unmount 2']);
  });
});

describe('rowTone', () => {
  it('adds btt-row--tone-<tone> for known tones only', () => {
    const tones: Record<number, string | undefined> = { 1: 'danger', 2: 'loud' };
    const rowTone = vi.fn((row: Row) => tones[row.id] as 'danger');
    const { container } = setup({ rowTone, rowClassName: () => 'mine' });
    const [first, second] = bodyRows(container);
    expect(first).toHaveClass('btt-row', 'btt-row--odd', 'btt-row--tone-danger', 'mine');
    expect(second.className).toBe('btt-row btt-row--even mine');
    expect(rowTone).toHaveBeenCalledWith(ROWS[0], 0);
  });
});

describe('row id order', () => {
  it('keeps id → ID → INDEX → N_ID', () => {
    const rows = [{ INDEX: 'i', ID: 'u', name: 'Ana' }] as unknown as Row[];
    const onSelectionChange = vi.fn();
    setup({ rows, selectable: true, onSelectionChange });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
    expect(onSelectionChange).toHaveBeenCalledWith(['u'], rows);
  });

  it('warns once per table when a row has id fields that disagree and no getRowId', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [{ id: 1, INDEX: 9, name: 'Ana' }] as unknown as Row[];
    const view = setup({ rows });
    view.rerender(<BTTable columns={[NAME]} rows={ROWS} />);
    view.rerender(<BTTable columns={[NAME]} rows={[...rows]} />);
    const calls = warn.mock.calls.filter(([message]) => String(message).includes('id fields with different values'));
    expect(calls).toHaveLength(1);
  });

  it('does not warn with getRowId, or when the fields agree', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setup({ rows: [{ id: 1, INDEX: 9, name: 'Ana' }] as unknown as Row[], getRowId: (row) => row.id });
    setup({ rows: [{ id: 7, ID: '7', name: 'Ana' }] as unknown as Row[] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('hasConflictingIds compares the id fields as text and ignores other values', () => {
    expect(hasConflictingIds({ id: 1, N_ID: 2 })).toBe(true);
    expect(hasConflictingIds({ id: 1, ID: '1', INDEX: null })).toBe(false);
    expect(hasConflictingIds({ ID: '7', INDEX: 7 })).toBe(false);
    expect(hasConflictingIds(null)).toBe(false);
  });
});
