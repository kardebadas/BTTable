import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps, BTTableManualProps } from './BTTableProps';
import type { FilterState, Query } from './core/types';
import { advance, COLUMNS, deferredServer, makeRows, names, renderServer, type Row, settle } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ROWS: Row[] = [
  { id: 1, name: 'Ana', state: 'ny' },
  { id: 2, name: 'Bruno', state: 'tx' },
  { id: 3, name: 'Carla', state: 'ny' },
];

function renderClient(props: Partial<BTTableClientProps<Row>> = {}) {
  return render(<BTTable columns={COLUMNS} rows={ROWS} searchDebounceMs={0} {...props} />);
}

const searchBox = () => screen.getByRole('textbox', { name: 'Search' });
const clearAllButton = () => screen.queryByRole('button', { name: 'Clear all' });

function typeSearch(text: string): void {
  fireEvent.change(searchBox(), { target: { value: text } });
  advance(0);
}

describe('Clear all (client mode)', () => {
  it('shows only while search or a filter is active', () => {
    renderClient();
    expect(clearAllButton()).toBeNull();
    typeSearch('a');
    expect(clearAllButton()).not.toBeNull();
    typeSearch('');
    expect(clearAllButton()).toBeNull();
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    expect(clearAllButton()).not.toBeNull();
  });

  it('clears search and filters at once, goes to page 1 and reports each change once', () => {
    const onSearchChange = vi.fn();
    const onFiltersChange = vi.fn();
    const onPageChange = vi.fn();
    const { container } = renderClient({ pageSize: 1, searchDebounceMs: 60_000, onSearchChange, onFiltersChange, onPageChange });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'ny' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(searchBox(), { target: { value: 'carla' } });
    advance(60_000);
    for (const mock of [onSearchChange, onFiltersChange, onPageChange]) mock.mockClear();
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(searchBox()).toHaveValue('');
    expect(screen.getByLabelText('State')).toHaveValue('');
    expect(names(container)).toEqual(['Ana']);
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('');
    expect(onFiltersChange).toHaveBeenCalledExactlyOnceWith({});
    expect(onPageChange).not.toHaveBeenCalled();
    expect(clearAllButton()).toBeNull();
  });

  it('reports page 1 when clearing from a later page', () => {
    const onPageChange = vi.fn();
    renderClient({ pageSize: 1, onPageChange });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'ny' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('proposes the clear to controlled search and filters', () => {
    const onSearchChange = vi.fn();
    const onFiltersChange = vi.fn();
    const { container } = renderClient({ searchValue: 'bru', filters: { state: 'tx' }, onSearchChange, onFiltersChange });
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('');
    expect(onFiltersChange).toHaveBeenCalledExactlyOnceWith({});
    expect(names(container)).toEqual(['Bruno']);
  });

  it('is hidden with clearAll={false}', () => {
    renderClient({ clearAll: false, defaultSearchValue: 'a' });
    expect(clearAllButton()).toBeNull();
  });

  it('leaves the filters alone when the search box × clears the search', () => {
    renderClient();
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'ny' } });
    typeSearch('carla');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('State')).toHaveValue('ny');
    expect(clearAllButton()).not.toBeNull();
  });
});

describe('Clear all (server and manual mode)', () => {
  it('sends the cleared query at once in server mode, without the typing debounce', async () => {
    const { calls } = renderServer({ pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'row' } });
    advance(250);
    expect(calls).toHaveLength(2);
    await settle(calls[1], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(calls).toHaveLength(3);
    expect(calls[2].query).toEqual({ page: 1, pageSize: 2, search: '', sort: null, filters: {} });
  });

  it('keeps a filter emptied by typing debounced', async () => {
    const { calls } = renderServer({ pageSize: 2, defaultFilters: { name: 'row' } });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    expect(calls).toHaveLength(1);
    advance(250);
    expect(calls).toHaveLength(2);
  });

  it('emits the cleared query once in manual mode', () => {
    const onQueryChange = vi.fn<(query: Query) => void>();
    const props: BTTableManualProps<Row> = { columns: COLUMNS, mode: 'manual', rows: makeRows(1, 2), totalRows: 2, onQueryChange, defaultFilters: { name: 'row' } };
    render(<BTTable {...props} />);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', filters: {} }));
    advance(1000);
    expect(onQueryChange).toHaveBeenCalledTimes(2);
  });

  it('sends a controlled clear at once when the parent echoes it', async () => {
    const { calls, fetchRows } = deferredServer();
    function Parent() {
      const [filters, setFilters] = useState<FilterState>({ name: 'row' });
      return <BTTable columns={COLUMNS} fetchRows={fetchRows} pageSize={2} filters={filters} onFiltersChange={setFilters} />;
    }
    render(<Parent />);
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(calls).toHaveLength(2);
    expect(calls[1].query.filters).toEqual({});
  });

  it('sends nothing when Clear all only drops search text not applied yet', async () => {
    const { calls } = renderServer({ pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.change(searchBox(), { target: { value: 'x' } });
    fireEvent.click(clearAllButton() as HTMLElement);
    advance(1000);
    expect(calls).toHaveLength(1);
  });

  it('emits nothing in manual mode when Clear all only drops search text not applied yet', () => {
    const onQueryChange = vi.fn<(query: Query) => void>();
    render(<BTTable columns={COLUMNS} mode="manual" rows={makeRows(1, 2)} totalRows={2} onQueryChange={onQueryChange} />);
    fireEvent.change(searchBox(), { target: { value: 'x' } });
    fireEvent.click(clearAllButton() as HTMLElement);
    advance(1000);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when Clear all within the typing debounce leaves the query on screen', async () => {
    const { calls } = renderServer({ pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'a' } });
    advance(100);
    fireEvent.click(clearAllButton() as HTMLElement);
    advance(1000);
    expect(calls).toHaveLength(1);
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('emits nothing in manual mode when Clear all within the typing debounce leaves the query on screen', () => {
    const onQueryChange = vi.fn<(query: Query) => void>();
    render(<BTTable columns={COLUMNS} mode="manual" rows={makeRows(1, 2)} totalRows={2} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'a' } });
    advance(100);
    fireEvent.click(clearAllButton() as HTMLElement);
    advance(1000);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
  });

  it('keeps later typing debounced after the parent rejects a controlled clear', async () => {
    const { calls, rerender } = renderServer({ pageSize: 2, filters: { name: 'row' }, onFiltersChange: vi.fn() });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(clearAllButton() as HTMLElement);
    rerender({ filters: { name: 'row' } });
    expect(calls).toHaveLength(1);
    rerender({ filters: { name: '' } });
    expect(calls).toHaveLength(1);
    advance(250);
    expect(calls).toHaveLength(2);
  });
});

describe('focus after Clear all', () => {
  it('moves to the search box', () => {
    renderClient();
    typeSearch('a');
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(searchBox()).toHaveFocus();
  });

  it('moves to the toolbar without a search box', () => {
    const { container } = renderClient({ search: false, defaultFilters: { state: 'ny' } });
    fireEvent.click(clearAllButton() as HTMLElement);
    expect(container.querySelector('.btt-toolbar')).toHaveFocus();
  });
});

describe('export buttons', () => {
  const exportProps = { exportCsv: true, exportFormats: ['pdf'], onExport: vi.fn() };
  const exportButtons = () => [screen.getByRole('button', { name: 'CSV' }), screen.getByRole('button', { name: 'PDF' })];

  it('are enabled with rows and disabled with no filtered rows (client mode)', () => {
    renderClient(exportProps);
    for (const button of exportButtons()) expect(button).toBeEnabled();
    typeSearch('nobody');
    for (const button of exportButtons()) expect(button).toBeDisabled();
  });

  it('are disabled while loading', () => {
    renderClient({ ...exportProps, loading: true });
    for (const button of exportButtons()) expect(button).toBeDisabled();
  });

  it('are disabled while server mode loads and enabled once rows arrive', async () => {
    const { calls } = renderServer(exportProps);
    for (const button of exportButtons()) expect(button).toBeDisabled();
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    for (const button of exportButtons()) expect(button).toBeEnabled();
  });
});

describe('counter help', () => {
  const helpButton = () => screen.getByRole('button', { name: 'About the counter' });
  const tooltip = () => screen.getByRole('tooltip', { hidden: true });

  it('describes the server counter through a tooltip that opens on hover and focus', async () => {
    const { calls } = renderServer();
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    expect(helpButton()).toHaveAccessibleDescription('Search and filters run on the whole dataset; one page is shown at a time.');
    expect(tooltip()).not.toBeVisible();
    fireEvent.mouseEnter(helpButton());
    expect(tooltip()).toBeVisible();
    fireEvent.mouseLeave(helpButton());
    expect(tooltip()).not.toBeVisible();
    act(() => helpButton().focus());
    expect(tooltip()).toBeVisible();
    act(() => helpButton().blur());
    expect(tooltip()).not.toBeVisible();
  });

  it('closes on Escape', async () => {
    const { calls } = renderServer();
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    fireEvent.mouseEnter(helpButton());
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(tooltip()).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(tooltip()).not.toBeVisible();
  });

  it('stops the Escape that closes it, and lets other Escapes through', async () => {
    const { calls } = renderServer();
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    fireEvent.mouseEnter(helpButton());
    fireEvent.keyDown(helpButton(), { key: 'Escape' });
    expect(outside).not.toHaveBeenCalled();
    fireEvent.keyDown(helpButton(), { key: 'Escape' });
    expect(outside).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', outside);
  });

  it('lets an Escape aimed at another focused element through while only hovered', async () => {
    const { calls } = renderServer();
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    fireEvent.mouseEnter(helpButton());
    const filter = screen.getByLabelText('Name');
    act(() => filter.focus());
    fireEvent.keyDown(filter, { key: 'Escape' });
    expect(outside).toHaveBeenCalledTimes(1);
    expect(tooltip()).not.toBeVisible();
    document.removeEventListener('keydown', outside);
  });

  it('stays open while focused after the pointer leaves, and reopens after Escape on the next hover', async () => {
    const { calls } = renderServer();
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    act(() => helpButton().focus());
    fireEvent.mouseEnter(helpButton());
    fireEvent.mouseLeave(helpButton());
    expect(tooltip()).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(tooltip()).not.toBeVisible();
    fireEvent.mouseEnter(helpButton());
    expect(tooltip()).toBeVisible();
  });

  it('shows in manual mode, takes its labels, and is absent in client mode', () => {
    const labels = { counterHelp: 'Una página', counterHelpButton: 'Ayuda' };
    const view = render(<BTTable columns={COLUMNS} mode="manual" rows={makeRows(1, 2)} totalRows={2} onQueryChange={vi.fn()} labels={labels} />);
    expect(screen.getByRole('button', { name: 'Ayuda' })).toHaveAccessibleDescription('Una página');
    view.unmount();
    renderClient();
    expect(screen.queryByRole('button', { name: 'About the counter' })).toBeNull();
    expect(screen.getByText('Showing 1–3 of 3')).toBeInTheDocument();
  });
});
