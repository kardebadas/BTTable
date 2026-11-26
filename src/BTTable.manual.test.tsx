import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableManualProps } from './BTTableProps';
import type { Query } from './core/types';
import { advance, COLUMNS, makeRows, names, type Row } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type ManualProps = Partial<BTTableManualProps<Row>>;

/** Renders a manual-mode table; `rerender` merges new props over the first ones. */
function renderManual(props: ManualProps = {}) {
  const onQueryChange = vi.fn<(query: Query) => void>();
  const element = (next: ManualProps) => <BTTable columns={COLUMNS} mode="manual" rows={[]} onQueryChange={onQueryChange} {...props} {...next} />;
  const view = render(element({}));
  const rerender = (next: ManualProps) => view.rerender(element(next));
  return { ...view, onQueryChange, rerender };
}

const queries = (onQueryChange: ReturnType<typeof vi.fn>) => onQueryChange.mock.calls.map(([query]) => query as Query);
const searchBox = () => screen.getByRole('textbox', { name: 'Search' });
const bodyBoxes = (container: HTMLElement) => within(container.querySelector('tbody') as HTMLElement).getAllByRole('checkbox');

describe('manual mode: queries', () => {
  it('emits the server-mode query once at mount, also under StrictMode', () => {
    const onQueryChange = vi.fn();
    render(
      <StrictMode>
        <BTTable columns={COLUMNS} mode="manual" rows={[]} onQueryChange={onQueryChange} pageSize={10} defaultSort={{ key: 'name', direction: 'asc' }} />
      </StrictMode>,
    );
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 10, search: '', sort: { key: 'name', direction: 'asc' }, filters: {} });
  });

  it('debounces typed search and emits page and sort changes at once', () => {
    const { onQueryChange } = renderManual({ pageSize: 2, rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(queries(onQueryChange).map((query) => [query.page, query.sort])).toEqual([
      [1, null],
      [2, null],
      [2, { key: 'name', direction: 'asc' }],
    ]);
    fireEvent.change(searchBox(), { target: { value: 'ro' } });
    advance(249);
    expect(onQueryChange).toHaveBeenCalledTimes(3);
    advance(1);
    expect(onQueryChange).toHaveBeenCalledTimes(4);
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'ro' }));
  });

  it('debounces a typed filter and emits nothing when typing returns to the query already emitted', () => {
    const { onQueryChange } = renderManual();
    const nameFilter = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(nameFilter, { target: { value: 'a' } });
    advance(100);
    fireEvent.change(nameFilter, { target: { value: '' } });
    advance(1000);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    fireEvent.change(nameFilter, { target: { value: 'b' } });
    advance(1000);
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { name: { type: 'text', op: 'contains', value: 'b' } } }));
  });

  it('emits the current query again when refreshKey changes', () => {
    const { onQueryChange, rerender } = renderManual();
    rerender({ refreshKey: 1 });
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    expect(onQueryChange.mock.calls[1][0]).toEqual(onQueryChange.mock.calls[0][0]);
  });

  it('sends the controlled view state and emits nothing when the parent ignores a change', () => {
    const onPageChange = vi.fn();
    const { onQueryChange } = renderManual({ page: 2, pageSize: 2, rows: makeRows(3, 2), totalRows: 6, onPageChange });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3);
    expect(queries(onQueryChange).map((query) => query.page)).toEqual([2]);
  });
});

describe('manual mode: rows, counter and pages', () => {
  it('renders the rows the parent passes, map keys as ids, without a missing-id warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSelectionChange = vi.fn();
    const rows = { a: { id: undefined, name: 'Ana', state: 'ny' }, b: { id: undefined, name: 'Bo', state: 'tx' } } as unknown as Record<string, Row>;
    const { container } = renderManual({ rows, totalRows: 2, selectable: true, onSelectionChange });
    expect(names(container)).toEqual(['Ana', 'Bo']);
    fireEvent.click(bodyBoxes(container)[1]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(['b']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once when selectable array rows have no id and no getRowId is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderManual({ rows: [{ name: 'a', state: 'ny' }] as never, totalRows: 1, selectable: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/selectable paged rows need ids/);
  });

  it('counts from the totals and pages through totalFilteredRows', () => {
    renderManual({ pageSize: 2, page: 2, rows: makeRows(3, 2), totalRows: 30, totalFilteredRows: 5 });
    expect(screen.getByText('Showing 3–4 of 5 (filtered from 30)')).toBeInTheDocument();
    expect(screen.getByText('of 3')).toBeInTheDocument();
  });

  it('offers a next page after a full page when totals are missing, and none after a short one', () => {
    const { rerender } = renderManual({ pageSize: 2, rows: makeRows(1, 2) });
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
    rerender({ rows: makeRows(1, 1) });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('hides the counter while the first page loads', () => {
    const { container, rerender } = renderManual({ loading: true });
    expect(screen.queryByText('No records')).toBeNull();
    expect(container.querySelector('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    rerender({ loading: false, totalRows: 0 });
    expect(screen.getByText('No records')).toBeInTheDocument();
  });

  it('clamps the page to the totals, reported through onQueryChange and onPageChange, not while loading', () => {
    const onPageChange = vi.fn();
    const { onQueryChange, rerender } = renderManual({ pageSize: 10, defaultPage: 5, loading: true, totalRows: 25, onPageChange });
    expect(onPageChange).not.toHaveBeenCalled();
    rerender({ loading: false, totalRows: 25 });
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3);
    expect(queries(onQueryChange).map((query) => query.page)).toEqual([5, 3]);
  });

  it('clamps only against totals that answer the current query, keeping a deep-linked page', () => {
    const onPageChange = vi.fn();
    const { onQueryChange, rerender } = renderManual({ pageSize: 10, defaultPage: 5, loading: false, totalRows: 0, onPageChange });
    expect(queries(onQueryChange).map((query) => query.page)).toEqual([5]);
    expect(onPageChange).not.toHaveBeenCalled();
    rerender({ rows: makeRows(41, 0), totalRows: 30 });
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3);
    expect(queries(onQueryChange).map((query) => query.page)).toEqual([5, 3]);
  });

  it('always paginates and warns once that pagination={false} is ignored', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderManual({ pagination: false, pageSize: 2, rows: makeRows(1, 2), totalRows: 4 });
    expect(container.querySelector('.btt-pagination')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ignored in manual mode; pages always come from the parent/);
  });
});

describe('manual mode: selection and export', () => {
  it('selects the current page with the header box and keeps ids from other pages', () => {
    const onSelectionChange = vi.fn();
    const { container, rerender } = renderManual({ pageSize: 2, rows: makeRows(1, 2), totalRows: 4, selectable: true, onSelectionChange });
    fireEvent.click(bodyBoxes(container)[0]);
    rerender({ rows: makeRows(3, 2) });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 3, 4]);
  });

  it('exports the rows of the current page', () => {
    const onExport = vi.fn();
    renderManual({ rows: makeRows(1, 2), totalRows: 50, onExport, exportFormats: ['pdf'] });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(onExport).toHaveBeenCalledWith('pdf', { headers: ['Name', 'State'], rows: [['Row 1', 'ny'], ['Row 2', 'ny']] });
  });
});

describe('manual mode: invalid props', () => {
  it.each([
    ['without onQueryChange', { onQueryChange: undefined }],
    ['without rows', { rows: undefined }],
    ['with fetchRows', { fetchRows: vi.fn() }],
  ])('renders the error fallback %s', (_, props) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    renderManual({ ...(props as ManualProps), onError });
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(onError.mock.calls[0][0].message).toMatch(/mode="manual" needs `rows` and `onQueryChange`/);
  });
});

type Loaded = { rows: Row[]; total: number };
type ParentPage = { query: Query | null; rows: Row[]; total?: number; error?: boolean };

/** The README's parent: loads each query, drops responses to queries no longer current, ends loading on failure. */
function ManualParent({ load }: { load: (query: Query) => Promise<Loaded> }) {
  const [query, setQuery] = useState<Query | null>(null);
  const [page, setPage] = useState<ParentPage>({ query: null, rows: [] });
  useEffect(() => {
    if (!query) return;
    let current = true;
    load(query).then(
      (result) => current && setPage({ query, rows: result.rows, total: result.total }),
      () => current && setPage({ query, rows: [], error: true }),
    );
    return () => {
      current = false;
    };
  }, [query, load]);
  const loading = query === null || page.query !== query;
  const emptyMessage = page.error ? 'Could not load the users.' : undefined;
  return <BTTable columns={COLUMNS} mode="manual" rows={page.rows} totalRows={page.total} loading={loading} onQueryChange={setQuery} pageSize={2} emptyMessage={emptyMessage} />;
}

describe('manual mode: a parent that guards against stale responses', () => {
  it('shows the response of the latest query only', async () => {
    const pending: { query: Query; resolve: (value: { rows: Row[]; total: number }) => void }[] = [];
    const load = (query: Query) => new Promise<{ rows: Row[]; total: number }>((resolve) => pending.push({ query, resolve }));
    const { container } = render(<ManualParent load={load} />);
    await act(async () => pending[0].resolve({ rows: makeRows(1, 2), total: 6 }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await act(async () => pending[2].resolve({ rows: makeRows(5, 2), total: 6 }));
    await act(async () => pending[1].resolve({ rows: makeRows(3, 2), total: 6 }));
    expect(pending.map((entry) => entry.query.page)).toEqual([1, 2, 3]);
    expect(names(container)).toEqual(['Row 5', 'Row 6']);
    expect(screen.getByText('Showing 5–6 of 6')).toBeInTheDocument();
  });

  it('paints loading, not the empty message, before the first query is emitted', () => {
    const html = renderToString(<ManualParent load={() => new Promise(() => {})} />);
    expect(html).toContain('Loading…');
    expect(html).not.toContain('No records found');
  });

  it('ends loading and shows the failure when a load fails', async () => {
    const { container } = render(<ManualParent load={() => Promise.reject(new Error('boom'))} />);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(container.querySelector('.btt-empty')).toHaveTextContent('Could not load the users.');
  });
});
