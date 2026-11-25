import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { FilterState, SortState } from './core/types';
import { advance, COLUMNS, deferredServer, makeRows, renderServer, settle } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const searchBox = () => screen.getByRole('textbox', { name: 'Search' });

describe('controlled props in server mode', () => {
  it('sends the controlled values in the first query', () => {
    const { calls } = renderServer({ pageSize: 10, searchValue: 'a', filters: { state: 'tx' }, sort: { key: 'name', direction: 'desc' }, page: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toEqual({ page: 3, pageSize: 10, search: 'a', sort: { key: 'name', direction: 'desc' }, filters: { state: { type: 'select', value: 'tx' } } });
  });

  it('sends nothing when the parent ignores a proposed change', async () => {
    const onPageChange = vi.fn();
    const onSortChange = vi.fn();
    const { calls } = renderServer({ pageSize: 10, page: 1, sort: null, onPageChange, onSortChange });
    await settle(calls[0], { rows: makeRows(1, 10), totalRows: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    advance(1000);
    expect(calls).toHaveLength(1);
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(2);
    expect(onSortChange).toHaveBeenCalledExactlyOnceWith({ key: 'name', direction: 'asc' });
  });

  it('reports the page clamped to the reported total', async () => {
    const onPageChange = vi.fn();
    const { calls } = renderServer({ pageSize: 10, page: 5, onPageChange });
    await settle(calls[0], { rows: [], totalRows: 25 });
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('fetches once, on page 1, when the parent sets a new search value', async () => {
    const onPageChange = vi.fn();
    const { calls, rerender } = renderServer({ pageSize: 10, searchValue: '', defaultPage: 2, onPageChange });
    await settle(calls[0], { rows: makeRows(11, 10), totalRows: 30 });
    rerender({ searchValue: 'abc', defaultPage: 2, onPageChange });
    advance(1000);
    expect(calls).toHaveLength(2);
    expect(calls[1].query).toMatchObject({ page: 1, search: 'abc' });
    expect(searchBox()).toHaveValue('abc');
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });
});

/** A server-mode parent that controls the view state and echoes each change back. */
function EchoServer({ fetchRows }: { fetchRows: ReturnType<typeof deferredServer>['fetchRows'] }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  return (
    <BTTable
      columns={COLUMNS}
      fetchRows={fetchRows}
      pageSize={10}
      searchValue={search}
      onSearchChange={setSearch}
      filters={filters}
      onFiltersChange={setFilters}
      sort={sort}
      onSortChange={setSort}
      page={page}
      onPageChange={setPage}
    />
  );
}

/** A server-mode parent that controls the page (starting at 3) and takes the search from its own parent. */
function PageParent({ fetchRows, searchValue, onQueryChange }: { fetchRows: ReturnType<typeof deferredServer>['fetchRows']; searchValue: string; onQueryChange: () => void }) {
  const [page, setPage] = useState(3);
  return <BTTable columns={COLUMNS} fetchRows={fetchRows} pageSize={10} searchValue={searchValue} page={page} onPageChange={setPage} onQueryChange={onQueryChange} />;
}

describe('a parent change under a controlled page', () => {
  it('sends one request, already on page 1', async () => {
    const { calls, fetchRows } = deferredServer();
    const onQueryChange = vi.fn();
    const { rerender } = render(<PageParent fetchRows={fetchRows} searchValue="" onQueryChange={onQueryChange} />);
    await settle(calls[0], { rows: makeRows(21, 10), totalRows: 50 });
    rerender(<PageParent fetchRows={fetchRows} searchValue="abc" onQueryChange={onQueryChange} />);
    advance(1000);
    expect(calls.map((call) => call.query.page)).toEqual([3, 1]);
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'abc' }));
  });
});

describe('a server-mode parent echoing every change', () => {
  it('sends exactly one request per change', async () => {
    const { calls, fetchRows } = deferredServer();
    render(<EchoServer fetchRows={fetchRows} />);
    await settle(calls[0], { rows: makeRows(1, 10), totalRows: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(calls).toHaveLength(2);
    expect(calls[1].query.page).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(calls).toHaveLength(3);
    expect(calls[2].query.sort).toEqual({ key: 'name', direction: 'asc' });
    fireEvent.change(searchBox(), { target: { value: 'R' } });
    advance(100);
    fireEvent.change(searchBox(), { target: { value: 'Ro' } });
    expect(calls).toHaveLength(3);
    advance(250);
    expect(calls).toHaveLength(4);
    expect(calls[3].query).toMatchObject({ search: 'Ro', page: 1 });
    expect(searchBox()).toHaveValue('Ro');
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    act(() => void vi.runAllTimers());
    expect(calls).toHaveLength(5);
    expect(calls[4].query).toMatchObject({ filters: { state: { type: 'select', value: 'tx' } }, page: 1 });
  });
});
