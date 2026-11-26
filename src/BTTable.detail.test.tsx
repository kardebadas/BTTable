import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import type { Column } from './core/types';
import type { RowId } from './hooks/rowModel';
import type { BTTableHandle } from './hooks/useTableHandle';
import { makeRows, renderServer, type Row, settle } from './testing/serverFixture';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ROWS: Row[] = [
  { id: 1, name: 'Ana', state: 'ny' },
  { id: 2, name: 'Bruno', state: 'tx' },
  { id: 3, name: 'Carla', state: 'ny' },
];
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', width: 120 },
  { key: 'state', header: 'State' },
];
const detail = ({ row, rowId }: { row: Row; rowId: RowId }) => <p>{`Detail of ${row.name} (${rowId})`}</p>;

function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  return render(<BTTable columns={COLUMNS} rows={ROWS} renderDetail={detail} {...props} />);
}

const toggles = () => screen.getAllByRole('button', { name: 'Row details' });
const dataRows = (container: HTMLElement) => Array.from(container.querySelectorAll('tbody tr.btt-row'));
const detailRows = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr.btt-detail-row'));

describe('the detail toggle column', () => {
  it('leads every row with a real button, named by labels, collapsed at first', () => {
    const { container } = setup();
    const header = container.querySelector('thead th') as HTMLElement;
    expect(header).toHaveClass('btt-th--expand');
    expect(header).toHaveTextContent('Row details');
    expect(toggles()).toHaveLength(3);
    for (const button of toggles()) {
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).not.toHaveAttribute('aria-controls');
      expect(button.closest('td')).toBe(button.closest('tr')?.cells[0]);
    }
    expect(detailRows(container)).toHaveLength(0);
  });

  it('is absent without renderDetail', () => {
    const { container } = setup({ renderDetail: undefined, defaultExpandedIds: [1] });
    expect(screen.queryByRole('button', { name: 'Row details' })).toBeNull();
    expect(container.querySelector('col.btt-col-expand')).toBeNull();
    expect(detailRows(container)).toHaveLength(0);
  });

  it('takes its name from labels.rowDetails', () => {
    setup({ labels: { rowDetails: 'Mais' } });
    expect(screen.getAllByRole('button', { name: 'Mais' })).toHaveLength(3);
  });

  it('gets a fixed width before the selection column; data column widths do not change', () => {
    const { container } = setup({ selectable: true });
    const cols = Array.from(container.querySelectorAll('col'));
    expect(cols.map((col) => col.className)).toEqual(['btt-col-expand', 'btt-col-select', '', '']);
    expect(cols.map((col) => col.style.width)).toEqual(['40px', '40px', '120px', '']);
    expect((container.querySelector('table') as HTMLElement).style.minWidth).toBe(`${40 + 40 + 120 + 60}px`);
    const cells = dataRows(container)[0].querySelectorAll('td');
    expect(cells[0]).toHaveClass('btt-cell--expand');
    expect(cells[1]).toHaveClass('btt-cell--select');
  });

  it('is operable from the keyboard: Enter on the focused button opens the row', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const { container } = setup();
    toggles()[0].focus();
    await user.keyboard('{Enter}');
    expect(toggles()[0]).toHaveFocus();
    expect(toggles()[0]).toHaveAttribute('aria-expanded', 'true');
    expect(detailRows(container)).toHaveLength(1);
  });
});

describe('detail rows', () => {
  it('open right after their data row, as one cell spanning every column', () => {
    const { container } = setup({ selectable: true });
    fireEvent.click(toggles()[1]);
    const [detailRow] = detailRows(container);
    expect(detailRow.previousElementSibling).toBe(dataRows(container)[1]);
    expect(detailRow).not.toHaveClass('btt-row');
    expect(detailRow.cells).toHaveLength(1);
    expect(detailRow.cells[0].colSpan).toBe(4);
    expect(detailRow).toHaveTextContent('Detail of Bruno (2)');
    expect(toggles()[1]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles()[1]).toHaveAttribute('aria-controls', detailRow.id);
    expect(document.getElementById(detailRow.id)).toBe(detailRow);
    expect(dataRows(container)).toHaveLength(3);
  });

  it('stay open several at once and report every change', () => {
    const onExpandedChange = vi.fn();
    const { container } = setup({ onExpandedChange });
    fireEvent.click(toggles()[0]);
    fireEvent.click(toggles()[2]);
    expect(detailRows(container).map((row) => row.textContent)).toEqual(['Detail of Ana (1)', 'Detail of Carla (3)']);
    expect(onExpandedChange).toHaveBeenLastCalledWith([1, 3]);
    fireEvent.click(toggles()[0]);
    expect(onExpandedChange).toHaveBeenLastCalledWith([3]);
    expect(detailRows(container)).toHaveLength(1);
  });

  it('start from defaultExpandedIds', () => {
    const { container } = setup({ defaultExpandedIds: [3] });
    expect(detailRows(container).map((row) => row.textContent)).toEqual(['Detail of Carla (3)']);
  });

  it('follow a controlled expandedIds and only ask for changes', () => {
    const onExpandedChange = vi.fn();
    const { container, rerender } = setup({ expandedIds: [2], onExpandedChange });
    fireEvent.click(toggles()[0]);
    expect(onExpandedChange).toHaveBeenCalledWith([2, 1]);
    expect(detailRows(container)).toHaveLength(1);
    rerender(<BTTable columns={COLUMNS} rows={ROWS} renderDetail={detail} expandedIds={[1, 2]} onExpandedChange={onExpandedChange} />);
    expect(detailRows(container)).toHaveLength(2);
  });

  it('never fire the row click from the toggle', () => {
    const onClick = vi.fn();
    setup({ rowProps: () => ({ onClick }) });
    fireEvent.click(toggles()[0]);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('give every detail row a distinct id, also across tables and for ids with spaces', () => {
    const rows = [{ id: 'a b', name: 'Spacey', state: 'ny' }] as unknown as Row[];
    const { container } = render(
      <>
        <BTTable columns={COLUMNS} rows={rows} renderDetail={detail} defaultExpandedIds={['a b']} />
        <BTTable columns={COLUMNS} rows={rows} renderDetail={detail} defaultExpandedIds={['a b']} />
      </>,
    );
    const ids = detailRows(container).map((row) => row.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).not.toMatch(/\s/);
  });

  it('count the toggle column in the empty row', () => {
    const { container } = setup({ rows: [], selectable: true });
    expect((container.querySelector('td.btt-empty') as HTMLTableCellElement).colSpan).toBe(4);
  });

  it('count the toggle column in the render error row', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = () => {
      throw new Error('boom');
    };
    const { container } = setup({ defaultExpandedIds: [1], renderDetail: boom });
    expect((container.querySelector('td.btt-error') as HTMLTableCellElement).colSpan).toBe(3);
  });
});

describe('the expanded ids', () => {
  it('drop rows that vanish from client rows, like selection', () => {
    const onExpandedChange = vi.fn();
    const { rerender } = setup({ defaultExpandedIds: [1, 2], onExpandedChange });
    rerender(<BTTable columns={COLUMNS} rows={ROWS.slice(1)} renderDetail={detail} onExpandedChange={onExpandedChange} />);
    expect(onExpandedChange).toHaveBeenLastCalledWith([2]);
  });

  it('keep the rows of other pages in server mode', async () => {
    const onExpandedChange = vi.fn();
    const { calls, container } = renderServer({ renderDetail: detail, defaultExpandedIds: [1, 5], onExpandedChange, pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 10 });
    expect(detailRows(container)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { rows: makeRows(5, 2), totalRows: 10 });
    expect(detailRows(container).map((row) => row.textContent)).toEqual(['Detail of Row 5 (5)']);
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it('warn once in server mode when rows have no ids (index ids would open the same position on every page)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls } = renderServer({ renderDetail: detail });
    await settle(calls[0], { rows: [{ name: 'a', state: 'ny' }] as never, totalRows: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/expandable \(renderDetail\) paged rows need ids/);
  });

  it('do not warn in server mode when rows have ids', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls } = renderServer({ renderDetail: detail });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('work in manual mode', () => {
    const { container } = render(
      <BTTable columns={COLUMNS} mode="manual" rows={ROWS} onQueryChange={vi.fn()} renderDetail={detail} defaultExpandedIds={[2]} />,
    );
    expect(detailRows(container).map((row) => row.textContent)).toEqual(['Detail of Bruno (2)']);
  });

  it('clear when renderDetail goes away, reported once', () => {
    const onExpandedChange = vi.fn();
    const { rerender } = setup({ defaultExpandedIds: [1], onExpandedChange });
    rerender(<BTTable columns={COLUMNS} rows={ROWS} onExpandedChange={onExpandedChange} />);
    expect(onExpandedChange).toHaveBeenCalledTimes(1);
    expect(onExpandedChange).toHaveBeenCalledWith([]);
  });
});

describe('with detail rows', () => {
  it('rows stay memoized: opening one re-renders no other row', () => {
    const renders = vi.fn();
    const columns: Column<Row>[] = [
      {
        key: 'name',
        header: 'Name',
        render: ({ row }) => {
          renders(row.id);
          return row.name;
        },
      },
    ];
    render(<BTTable columns={columns} rows={ROWS} renderDetail={detail} />);
    renders.mockClear();
    fireEvent.click(toggles()[1]);
    expect(renders.mock.calls).toEqual([[2]]);
  });

  it('the handle finds cells after the toggle and selection cells', () => {
    const ref = createRef<BTTableHandle>();
    render(<BTTable ref={ref} columns={COLUMNS} rows={ROWS} renderDetail={detail} selectable />);
    expect(ref.current?.getCellElement(2, 'state')?.textContent).toBe('tx');
  });

  it('a parent can drive expandedIds from onExpandedChange', () => {
    function Parent() {
      const [ids, setIds] = useState<RowId[]>([]);
      return <BTTable columns={COLUMNS} rows={ROWS} renderDetail={detail} expandedIds={ids} onExpandedChange={setIds} />;
    }
    const { container } = render(<Parent />);
    fireEvent.click(toggles()[2]);
    expect(within(detailRows(container)[0]).getByText('Detail of Carla (3)')).toBeInTheDocument();
  });
});
