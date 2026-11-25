import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import { advance, COLUMNS, deferredServer, makeRows, names, renderServer, settle } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('refreshKey and resetKey', () => {
  it('refetches the same query when refreshKey changes', async () => {
    const { calls, rerender } = renderServer({ pageSize: 10, refreshKey: 0 });
    await settle(calls[0], { rows: makeRows(1, 10), totalRows: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { rows: makeRows(11, 10), totalRows: 30 });
    rerender({ refreshKey: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[2].query).toEqual(calls[1].query);
  });

  it('clears search and filters, keeps sort and page size, and fetches exactly once on resetKey', async () => {
    const { calls, rerender } = renderServer({ pageSize: 10, resetKey: 'a' });
    await settle(calls[0], { rows: makeRows(1, 10), totalRows: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'q' } });
    advance(250);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'xy' } });
    const before = calls.length;
    rerender({ resetKey: 'b' });
    expect(calls).toHaveLength(before + 1);
    advance(1000);
    expect(calls).toHaveLength(before + 1);
    expect(calls[before].query).toEqual({ page: 1, pageSize: 10, search: '', sort: { key: 'name', direction: 'asc' }, filters: {} });
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('');
  });

  it('fetches once on resetKey even when nothing was set', () => {
    const { calls, rerender } = renderServer({ resetKey: 1 });
    rerender({ resetKey: 2 });
    expect(calls).toHaveLength(2);
    expect(calls[0].signal.aborted).toBe(true);
  });
});

describe('paging', () => {
  it('moves to the last page and refetches once when the total shrinks', async () => {
    const onQueryChange = vi.fn();
    const { calls, rerender } = renderServer({ pageSize: 10, refreshKey: 0, onQueryChange });
    await settle(calls[0], { rows: makeRows(1, 10), totalRows: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[2], { rows: makeRows(21, 10), totalRows: 30 });
    rerender({ refreshKey: 1 });
    await settle(calls[3], { rows: [], totalRows: 30, totalFilteredRows: 15 });
    expect(calls).toHaveLength(5);
    expect(calls[4].query.page).toBe(2);
    expect(onQueryChange).toHaveBeenLastCalledWith(calls[4].query);
    await settle(calls[4], { rows: makeRows(11, 5), totalRows: 30, totalFilteredRows: 15 });
    expect(calls).toHaveLength(5);
    expect(screen.getByText('Showing 11–15 of 15 (filtered from 30)')).toBeInTheDocument();
  });

  it('exports the rows of the current page', async () => {
    const onExport = vi.fn();
    const { calls } = renderServer({ onExport, exportFormats: ['pdf'] });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 50 });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(onExport).toHaveBeenCalledWith('pdf', { headers: ['Name', 'State'], rows: [['Row 1', 'ny'], ['Row 2', 'ny']] });
  });
});

describe('selection', () => {
  it('selects the current page with the header box and keeps selections across pages', async () => {
    const onSelectionChange = vi.fn();
    const { container, calls } = renderServer({ pageSize: 2, selectable: true, onSelectionChange });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(within(container.querySelector('tbody') as HTMLElement).getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { rows: makeRows(3, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 3, 4]);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await settle(calls[2], { rows: makeRows(1, 2), totalRows: 4 });
    const boxes = within(container.querySelector('tbody') as HTMLElement).getAllByRole('checkbox');
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveProperty('indeterminate', true);
  });
});

describe('development warnings', () => {
  it('keeps the pagination footer and warns once when pagination is false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, calls, rerender } = renderServer({ pagination: false });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    rerender({ pagination: false, pageSize: 50 });
    expect(container.querySelector('.btt-pagination')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/pagination=\{false\} is ignored in server mode/);
  });

  it('warns once when selectable server rows have no id and no getRowId is given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls, rerender } = renderServer({ selectable: true });
    await settle(calls[0], { rows: [{ name: 'a', state: 'ny' }] as never, totalRows: 1 });
    rerender({ selectable: true, refreshKey: 1 });
    await settle(calls[1], { rows: [{ name: 'b', state: 'ny' }] as never, totalRows: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/getRowId/);
  });

  it('does not warn when rows have ids or getRowId is given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = renderServer({ selectable: true });
    await settle(first.calls[0], { rows: makeRows(1, 1), totalRows: 1 });
    cleanup();
    const second = renderServer({ selectable: true, getRowId: (row) => row.name });
    await settle(second.calls[0], { rows: [{ name: 'a', state: 'ny' }] as never, totalRows: 1 });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('aborts the request in flight on unmount and does nothing when it answers', async () => {
    const onQueryChange = vi.fn();
    const { calls, fetchRows, unmount } = renderServer({ pageSize: 10, onQueryChange });
    unmount();
    expect(calls[0].signal.aborted).toBe(true);
    await settle(calls[0], { rows: [], totalRows: 0 });
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
  });

  it('drops a pending debounce timer on unmount', () => {
    const { calls, unmount } = renderServer();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'a' } });
    unmount();
    advance(1000);
    expect(calls).toHaveLength(1);
  });

  it('aborts the first request of a StrictMode double mount and renders the last', async () => {
    const { calls, fetchRows } = deferredServer();
    const { container } = render(
      <StrictMode>
        <BTTable columns={COLUMNS} fetchRows={fetchRows} />
      </StrictMode>,
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].signal.aborted).toBe(true);
    await settle(calls[1], { rows: makeRows(1, 1), totalRows: 1 });
    expect(names(container)).toEqual(['Row 1']);
  });

  it('ignores a late rejection of the aborted StrictMode request, which has the same query', async () => {
    const { calls, fetchRows } = deferredServer();
    render(
      <StrictMode>
        <BTTable columns={COLUMNS} fetchRows={fetchRows} />
      </StrictMode>,
    );
    await settle(calls[0], { error: new Error('aborted late') });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
