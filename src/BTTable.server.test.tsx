import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, makeRows, names, renderServer, settle } from './testing/serverFixture';

const FIRST_QUERY = { page: 1, pageSize: 100, search: '', sort: null, filters: {} };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the first request', () => {
  it('fetches page 1 at mount, reports the query and renders the rows', async () => {
    const onQueryChange = vi.fn();
    const { container, calls, fetchRows } = renderServer({ onQueryChange });
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(calls[0].query).toEqual(FIRST_QUERY);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(onQueryChange).toHaveBeenCalledWith(FIRST_QUERY);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(container.querySelector('table')).toHaveAttribute('aria-busy', 'true');
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    expect(names(container)).toEqual(['Row 1', 'Row 2']);
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  });

  it('counts from the rows when totals are missing', async () => {
    const { calls } = renderServer();
    await settle(calls[0], { rows: makeRows(1, 3) } as never);
    expect(screen.getByText('Showing 1–3 of 3')).toBeInTheDocument();
  });

  it('keeps showing loading while the `loading` prop is true', async () => {
    const { calls } = renderServer({ loading: true });
    await settle(calls[0], { rows: makeRows(1, 1), totalRows: 1 });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});

describe('scheduling', () => {
  it('debounces search typing and goes back to page 1', async () => {
    const { calls } = renderServer({ pageSize: 10 });
    await settle(calls[0], { rows: makeRows(1, 10), totalRows: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(calls).toHaveLength(2);
    const box = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(box, { target: { value: 'a' } });
    advance(200);
    fireEvent.change(box, { target: { value: 'ab' } });
    advance(249);
    expect(calls).toHaveLength(2);
    advance(1);
    expect(calls).toHaveLength(3);
    expect(calls[2].query).toMatchObject({ search: 'ab', page: 1 });
  });

  it('debounces text filter typing but sends select filters at once, as typed values', async () => {
    const { calls } = renderServer({ searchDebounceMs: 100 });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'an' } });
    advance(99);
    expect(calls).toHaveLength(1);
    advance(1);
    expect(calls[1].query.filters).toEqual({ name: { type: 'text', value: 'an' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    expect(calls).toHaveLength(3);
    expect(calls[2].query.filters).toEqual({ name: { type: 'text', value: 'an' }, state: { type: 'select', value: 'tx' } });
  });

  it('sends sort and page size changes at once and aborts the request in flight', () => {
    const { calls } = renderServer();
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].query.sort).toEqual({ key: 'name', direction: 'asc' });
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
    expect(calls[1].signal.aborted).toBe(true);
    expect(calls[2].query).toMatchObject({ pageSize: 25, page: 1, sort: { key: 'name', direction: 'asc' } });
  });
});

describe('returning to a query', () => {
  it('does not refetch nor show loading when going back to the page on screen before the next one answers', async () => {
    const onQueryChange = vi.fn();
    const { container, calls } = renderServer({ pageSize: 2, onQueryChange });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(calls).toHaveLength(2);
    expect(calls[1].signal.aborted).toBe(true);
    expect(onQueryChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(names(container)).toEqual(['Row 1', 'Row 2']);
  });

  it('shows loading, not the old error, when going back to a page that had failed', async () => {
    const { calls } = renderServer({ pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { rows: makeRows(3, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await settle(calls[2], { error: new Error('boom') });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Page 2 is on screen from calls[1], so Next sends nothing; Previous sends page 1 again.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(calls).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(calls).toHaveLength(4);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('does not refetch when a typed filter returns to the value on screen within the debounce', async () => {
    const { calls } = renderServer();
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    advance(1000);
    expect(calls).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('does not refetch when only surrounding spaces change', async () => {
    const { calls } = renderServer();
    const box = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(box, { target: { value: 'ab' } });
    advance(250);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    advance(250);
    expect(calls).toHaveLength(3);
    expect(calls[2].query).toMatchObject({ search: 'ab', filters: { name: { type: 'text', value: 'x' } } });
    fireEvent.change(box, { target: { value: 'ab ' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' x ' } });
    advance(1000);
    expect(calls).toHaveLength(3);
  });
});

describe('counter and page count', () => {
  it('hides the counter after an error but keeps the page count of the last totals', async () => {
    const { calls } = renderServer({ pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { error: new Error('boom') });
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByText('No records')).toBeNull();
    expect(screen.getByText('of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('offers a next page when totals are missing and the page is full', async () => {
    const { calls } = renderServer({ pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2) } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(calls).toHaveLength(2);
    expect(calls[1].query.page).toBe(2);
  });
});

describe('responses', () => {
  it('ignores a stale response even when the fetcher ignores the signal', async () => {
    const { container, calls } = renderServer();
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    await settle(calls[1], { rows: makeRows(5, 1), totalRows: 1 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    expect(names(container)).toEqual(['Row 5']);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps the last rows on screen while the next page loads', async () => {
    const { container, calls } = renderServer({ pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(names(container)).toEqual(['Row 1', 'Row 2']);
    await settle(calls[1], { rows: makeRows(3, 2), totalRows: 4 });
    expect(names(container)).toEqual(['Row 3', 'Row 4']);
    expect(screen.getByText('Showing 3–4 of 4')).toBeInTheDocument();
  });

  it('does not treat an AbortError as an error', async () => {
    const { container, calls } = renderServer();
    await settle(calls[0], { error: Object.assign(new Error('aborted'), { name: 'AbortError' }) });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(container.querySelector('.btt-empty')).toHaveTextContent('No records found');
  });

  it('shows an error row with Retry that refetches the same query', async () => {
    const { container, calls } = renderServer({ pageSize: 2, labels: { retry: 'Again' } });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { error: new Error('boom') });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the rows.');
    expect(names(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Again' }));
    expect(calls).toHaveLength(3);
    expect(calls[2].query).toEqual(calls[1].query);
    await settle(calls[2], { rows: makeRows(3, 2), totalRows: 4 });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(names(container)).toEqual(['Row 3', 'Row 4']);
  });

  it('treats a malformed result as an error', async () => {
    const { calls } = renderServer();
    await settle(calls[0], {} as never);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('reports a fetcher that throws synchronously as an error', async () => {
    const fetchRows = vi.fn(() => {
      throw new Error('sync');
    });
    renderServer({ fetchRows });
    await act(async () => {});
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
