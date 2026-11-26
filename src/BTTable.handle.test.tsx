import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import type { Column } from './core/types';
import type { BTTableHandle } from './hooks/useTableHandle';
import { COLUMNS, installFakeGeometry, makeRows, mountedIds, rowElement, rowProps, type Row, scroller, scrollTo } from './testing/virtualFixture';

installFakeGeometry();

function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  const ref = createRef<BTTableHandle>();
  const view = render(<BTTable ref={ref} columns={COLUMNS} rows={makeRows(1000)} pagination={false} rowProps={rowProps} {...props} />);
  return { ...view, handle: () => ref.current as BTTableHandle };
}

/** Fake rects: the scroll area at top 100, a 30 px header, the row with data-row-id 2 at `rowTop` (40 px tall). */
function mockRects(rowTop: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    let rect = { top: 0, height: 0 };
    if (this.classList.contains('btt-scroll')) rect = { top: 100, height: 200 };
    if (this.tagName === 'THEAD') rect = { top: 100, height: 30 };
    if ((this as HTMLElement).dataset?.rowId === '2') rect = { top: rowTop, height: 40 };
    return { ...rect, bottom: rect.top + rect.height, width: 100, left: 0, right: 100, x: 0, y: rect.top, toJSON: () => ({}) };
  });
}

describe('getRowElement and getCellElement', () => {
  it('return the mounted <tr> and <td> (after the selection cell), else null', () => {
    const { container, handle } = setup({ rows: makeRows(3), selectable: true });
    expect(handle().getRowElement(1)).toBe(rowElement(container, 1));
    expect(handle().getCellElement(1, 'name')?.textContent).toBe('Row 1');
    expect(handle().getCellElement(1, 'nope')).toBeNull();
    expect(handle().getCellElement(99, 'name')).toBeNull();
    expect(handle().getRowElement(99)).toBeNull();
  });

  it('forget rows that unmount', () => {
    const { container, handle } = setup();
    expect(handle().getRowElement(5)).not.toBeNull();
    expect(handle().getRowElement(500)).toBeNull();
    scrollTo(container, 20000);
    expect(handle().getRowElement(5)).toBeNull();
    expect(handle().getRowElement(500)).not.toBeNull();
  });
});

describe('scrollToRow', () => {
  it.each([
    ['start', 400, 100 + 270],
    ['end', 400, 100 + 140],
    ['end', 150, 100 - 110],
    ['center', 400, 100 + 205],
    ['nearest', 400, 100 + 140],
    ['nearest', 150, 100],
    ['nearest', 50, 100 - 80],
  ] as const)('align %s with the row at %i scrolls to %i, below the sticky header', (align, rowTop, expected) => {
    const { container, handle } = setup({ rows: makeRows(3) });
    scroller(container).scrollTop = 100;
    mockRects(rowTop);
    expect(handle().scrollToRow(2, { align })).toBe(true);
    expect(scroller(container).scrollTop).toBe(expected);
  });

  it('defaults to start', () => {
    const { container, handle } = setup({ rows: makeRows(3) });
    mockRects(400);
    handle().scrollToRow(2);
    expect(scroller(container).scrollTop).toBe(270);
  });

  it('mounts a virtualized row first, scrolling to its offset', () => {
    const { container, handle } = setup();
    expect(mountedIds(container)).not.toContain(500);
    act(() => {
      expect(handle().scrollToRow(500)).toBe(true);
    });
    expect(mountedIds(container)).toContain(500);
    expect(scroller(container).scrollTop).toBe(500 * 40);
  });

  it('moves a client table to the page of the row', () => {
    const onPageChange = vi.fn();
    const { handle } = setup({ rows: makeRows(250), pagination: true, pageSize: 100, onPageChange });
    act(() => {
      expect(handle().scrollToRow(150)).toBe(true);
    });
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(handle().getRowElement(150)).not.toBeNull();
  });

  it('returns false for a row that is not displayed', () => {
    const { handle } = setup({ rows: makeRows(3) });
    expect(handle().scrollToRow(42)).toBe(false);
  });

  it('pages only the current page in manual mode', () => {
    const ref = createRef<BTTableHandle>();
    render(<BTTable ref={ref} mode="manual" columns={COLUMNS} rows={makeRows(3)} totalRows={300} onQueryChange={() => {}} />);
    expect(ref.current?.scrollToRow(2)).toBe(true);
    expect(ref.current?.scrollToRow(150)).toBe(false);
  });

  it('scrolls the page itself when maxHeight is none', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { handle } = setup({ rows: makeRows(3), maxHeight: 'none' });
      handle().scrollToRow(2, { align: 'center' });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });
});

describe('focusCell', () => {
  const columns: Column<Row>[] = [...COLUMNS, { key: 'edit', header: 'Edit', render: () => <button type="button">Edit</button> }];

  it('focuses the first focusable element of the cell, else the cell itself', () => {
    const { container, handle } = setup({ rows: makeRows(3), columns });
    expect(handle().focusCell(1, 'edit')).toBe(true);
    expect(document.activeElement).toBe(rowElement(container, 1).querySelector('button'));
    expect(handle().focusCell(1, 'name')).toBe(true);
    const cell = (rowElement(container, 1) as HTMLTableRowElement).cells[1];
    expect(document.activeElement).toBe(cell);
    expect(cell.tabIndex).toBe(-1);
  });

  it('skips disabled, hidden and tabindex=-1 elements', () => {
    const skipped: Column<Row> = {
      key: 'mixed',
      header: 'Mixed',
      render: () => (
        <>
          <input type="hidden" />
          <button type="button" disabled>
            Off
          </button>
          <span tabIndex={-1}>no</span>
          <input aria-label="target" />
        </>
      ),
    };
    const { handle } = setup({ rows: makeRows(3), columns: [...COLUMNS, skipped] });
    handle().focusCell(1, 'mixed');
    expect(document.activeElement).toBe(screen.getAllByRole('textbox', { name: 'target' })[1]);
  });

  it('returns false for an unknown column or row', () => {
    const { handle } = setup({ rows: makeRows(3) });
    expect(handle().focusCell(1, 'nope')).toBe(false);
    expect(handle().focusCell(42, 'name')).toBe(false);
  });

  it('lands on a virtualized row of another page after scrolling, and keeps it mounted', () => {
    const onRowUnmount = vi.fn();
    const { container, handle } = setup({ rows: makeRows(400), pagination: true, pageSize: 200, onRowUnmount });
    scrollTo(container, 2000);
    act(() => {
      expect(handle().focusCell(250, 'name')).toBe(true);
    });
    const row = rowElement(container, 250) as HTMLTableRowElement;
    expect(row).not.toBeNull();
    expect(document.activeElement).toBe(row.cells[1]);
    expect(scroller(container).scrollTop).toBe(50 * 40);
    expect(onRowUnmount.mock.calls.map((call) => call[1])).not.toContain(250);
  });

  it('drops a request whose page change the parent ignores', () => {
    const ref = createRef<BTTableHandle>();
    const element = (page: number) => <BTTable ref={ref} columns={COLUMNS} rows={makeRows(250)} pageSize={100} page={page} />;
    const { rerender } = render(element(1));
    act(() => {
      expect(ref.current?.focusCell(150, 'name')).toBe(true);
    });
    rerender(element(2));
    expect(ref.current?.getRowElement(150)).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses a virtualized row once it is mounted', () => {
    const { container, handle } = setup();
    act(() => {
      handle().focusCell(700, 'name');
    });
    expect(document.activeElement).toBe((rowElement(container, 700) as HTMLTableRowElement).cells[1]);
  });
});

describe('clearSelection and resetView', () => {
  it('clearSelection unselects every row', () => {
    const onSelectionChange = vi.fn();
    const { handle } = setup({ rows: makeRows(3), selectable: true, defaultSelectedIds: [1, 2], onSelectionChange });
    act(() => handle().clearSelection());
    expect(onSelectionChange).toHaveBeenLastCalledWith([], []);
    expect(screen.queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
  });

  it('resetView goes back to the default search and page 1, scrolled to the top', () => {
    const onPageChange = vi.fn();
    const props = { rows: makeRows(250), pagination: true, pageSize: 100, defaultPage: 3, defaultSearchValue: 'Row', onPageChange };
    const { container, handle } = setup(props);
    const search = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(search, { target: { value: 'typed' } });
    scrollTo(container, 300);
    act(() => handle().resetView());
    expect(onPageChange).toHaveBeenCalledWith(1);
    expect(search).toHaveValue('Row');
    expect(scroller(container).scrollTop).toBe(0);
  });

  it('resetView sends the query again in manual mode, like a new resetKey', () => {
    const onQueryChange = vi.fn();
    const ref = createRef<BTTableHandle>();
    render(<BTTable ref={ref} mode="manual" columns={COLUMNS} rows={makeRows(3)} onQueryChange={onQueryChange} />);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    act(() => ref.current?.resetView());
    expect(onQueryChange).toHaveBeenCalledTimes(2);
  });
});

describe('onRowMount and onRowUnmount', () => {
  it('fire once per mounted row; new data with the same ids fires nothing; unmount gets the latest row', () => {
    const onRowMount = vi.fn();
    const onRowUnmount = vi.fn();
    const rows = makeRows(2);
    const { container, rerender, unmount } = setup({ rows, onRowMount, onRowUnmount });
    expect(onRowMount.mock.calls).toEqual([
      [rows[0], rowElement(container, 0), 0],
      [rows[1], rowElement(container, 1), 1],
    ]);
    const renamed = rows.map((row) => ({ ...row, name: `${row.name}!` }));
    rerender(<BTTable columns={COLUMNS} rows={renamed} pagination={false} rowProps={rowProps} onRowMount={onRowMount} onRowUnmount={onRowUnmount} />);
    expect(onRowMount).toHaveBeenCalledTimes(2);
    unmount();
    expect(onRowUnmount.mock.calls).toEqual([
      [renamed[0], 0],
      [renamed[1], 1],
    ]);
  });

  it('fire as virtualized rows enter and leave the mounted window', () => {
    const onRowMount = vi.fn();
    const onRowUnmount = vi.fn();
    const { container } = setup({ onRowMount, onRowUnmount });
    const before = mountedIds(container);
    onRowMount.mockClear();
    scrollTo(container, 2000);
    const after = mountedIds(container);
    expect(onRowMount.mock.calls.map((call) => call[2]).sort((a, b) => a - b)).toEqual(after.filter((id) => !before.includes(id)));
    expect(onRowUnmount.mock.calls.map((call) => call[1]).sort((a, b) => a - b)).toEqual(before.filter((id) => !after.includes(id)));
  });

  it('pair every mount with an unmount under StrictMode', () => {
    const live = new Set<number>();
    const onRowMount = vi.fn((_row: Row, _element: HTMLTableRowElement, id: string | number) => live.add(Number(id)));
    const onRowUnmount = vi.fn((_row: Row, id: string | number) => live.delete(Number(id)));
    const view = render(
      <StrictMode>
        <BTTable columns={COLUMNS} rows={makeRows(3)} onRowMount={onRowMount} onRowUnmount={onRowUnmount} />
      </StrictMode>,
    );
    expect([...live]).toEqual([0, 1, 2]);
    expect(onRowMount.mock.calls.length - onRowUnmount.mock.calls.length).toBe(3);
    view.unmount();
    expect(live.size).toBe(0);
  });

  it('new callback identities do not re-render the rows', () => {
    const rowClassName = vi.fn(() => undefined);
    const rows = makeRows(3);
    const element = (onRowMount: () => void) => (
      <BTTable columns={COLUMNS} rows={rows} rowClassName={rowClassName} onRowMount={onRowMount} onRowUnmount={() => {}} />
    );
    const { rerender } = render(element(() => {}));
    rowClassName.mockClear();
    const latest = vi.fn();
    rerender(element(latest));
    expect(rowClassName).not.toHaveBeenCalled();
  });

  it('call the functions of the render that mounts the row', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<BTTable columns={COLUMNS} rows={makeRows(1)} onRowMount={first} />);
    rerender(<BTTable columns={COLUMNS} rows={makeRows(2)} onRowMount={second} />);
    expect(first.mock.calls.map((call) => call[2])).toEqual([0]);
    expect(second.mock.calls.map((call) => call[2])).toEqual([1]);
  });
});
