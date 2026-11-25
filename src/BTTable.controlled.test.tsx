import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import type { FilterState, SortState } from './core/types';
import { COLUMNS, makeRows, names, type Row } from './testing/serverFixture';

// 30 rows: Row 1..Row 30; ids 1-15 in 'ny', 16-30 in 'tx'.
const ROWS: Row[] = makeRows(1, 30).map((row) => ({ ...row, state: row.id > 15 ? 'tx' : 'ny' }));

function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  const view = render(<BTTable columns={COLUMNS} rows={ROWS} pageSize={10} {...props} />);
  const rerender = (next: Partial<BTTableClientProps<Row>>) =>
    view.rerender(<BTTable columns={COLUMNS} rows={ROWS} pageSize={10} {...props} {...next} />);
  return { ...view, rerender };
}

const searchBox = () => screen.getByRole('textbox', { name: 'Search' });
const pageBox = () => screen.getByLabelText('Page');
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('initial values', () => {
  it('starts from defaultSort, defaultPage, defaultSearchValue and defaultFilters', () => {
    const { container } = setup({
      defaultSort: { key: 'name', direction: 'desc' },
      defaultPage: 2,
      defaultSearchValue: 'Row',
      defaultFilters: { state: 'ny' },
    });
    expect(searchBox()).toHaveValue('Row');
    expect(pageBox()).toHaveValue(2);
    // ny rows (1-15) sorted by name desc, natural order; page 2 of 10 per page.
    expect(names(container)).toEqual(['Row 5', 'Row 4', 'Row 3', 'Row 2', 'Row 1']);
  });

  it('merges defaultFilters over the column defaults', () => {
    const columns = COLUMNS.map((column) => (column.key === 'name' ? { ...column, filter: { type: 'text' as const, defaultValue: 'Row 1' } } : column));
    const { container } = render(<BTTable columns={columns} rows={ROWS} defaultFilters={{ state: 'tx' }} />);
    expect(names(container)).toEqual(['Row 16', 'Row 17', 'Row 18', 'Row 19']);
  });
});

describe('controlled sort', () => {
  it('renders the sort prop and only proposes the next sort', () => {
    const onSortChange = vi.fn();
    const { container, rerender } = setup({ sort: { key: 'name', direction: 'desc' }, onSortChange });
    expect(names(container)[0]).toBe('Row 30');
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(names(container)[0]).toBe('Row 30');
    rerender({ sort: null, onSortChange });
    expect(names(container)[0]).toBe('Row 1');
  });

  it('proposes the same change again after the parent ignored it', () => {
    const onSortChange = vi.fn();
    setup({ sort: null, onSortChange });
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange.mock.calls).toEqual([[{ key: 'name', direction: 'asc' }], [{ key: 'name', direction: 'asc' }]]);
  });

  it('reports changes in uncontrolled mode too', () => {
    const onSortChange = vi.fn();
    setup({ onSortChange });
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(onSortChange.mock.calls).toEqual([[{ key: 'name', direction: 'asc' }], [{ key: 'name', direction: 'desc' }]]);
  });

  it('treats an equal new sort or filters object as no change', () => {
    const onStateChange = vi.fn();
    const { container, rerender } = setup({ sort: { key: 'name', direction: 'desc' }, filters: { state: 'tx' }, onStateChange });
    rerender({ sort: { key: 'name', direction: 'desc' }, filters: { state: 'tx' }, onStateChange });
    expect(names(container)[0]).toBe('Row 30');
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });
});

describe('controlled page and page size', () => {
  it('renders the page prop and proposes page changes without moving', () => {
    const onPageChange = vi.fn();
    const { container } = setup({ page: 2, onPageChange });
    expect(names(container)[0]).toBe('Row 11');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3);
    expect(names(container)[0]).toBe('Row 11');
  });

  it('reports a page-size change and the move to page 1', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    setup({ defaultPage: 3, onPageChange, onPageSizeChange, pageSizeOptions: [10, 25] });
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
    expect(onPageSizeChange).toHaveBeenCalledExactlyOnceWith(25);
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('reports page 1, not the size, when the pageSize prop changes', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const { rerender } = setup({ page: 2, onPageChange, onPageSizeChange });
    rerender({ page: 2, onPageChange, onPageSizeChange, pageSize: 5 });
    expect(screen.getByLabelText('Rows per page')).toHaveValue('5');
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
    expect(onPageSizeChange).not.toHaveBeenCalled();
  });

  it('reports a clamped page once, even when the parent keeps the old page', () => {
    const onPageChange = vi.fn();
    const { container, rerender } = setup({ page: 3, onPageChange });
    rerender({ page: 3, onPageChange, rows: ROWS.slice(0, 15) });
    expect(names(container)[0]).toBe('Row 11');
    rerender({ page: 3, onPageChange, rows: ROWS.slice(0, 15), caption: 'again' });
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(2);
  });
});

const MULTI_COLUMNS = COLUMNS.map((column) =>
  column.key === 'state' ? { ...column, filter: { type: 'multiselect' as const, options: [{ value: 'ny', label: 'NY' }, { value: 'tx', label: 'TX' }] } } : column,
);

/** A parent that builds its filters, with an array value, anew on every render. */
function FreshArrayParent() {
  const [page, setPage] = useState(1);
  return <BTTable columns={MULTI_COLUMNS} rows={ROWS} pageSize={5} filters={{ state: ['ny'] }} page={page} onPageChange={setPage} />;
}

describe('page held on page 1 after a parent change', () => {
  it('ends when the page prop changes', () => {
    const { rerender } = setup({ searchValue: '', page: 3 });
    rerender({ searchValue: 'Row', page: 3 });
    expect(pageBox()).toHaveValue(1);
    rerender({ searchValue: 'Row', page: 1 });
    rerender({ searchValue: 'Row', page: 3 });
    expect(pageBox()).toHaveValue(3);
  });

  it('ends with the table\'s next move', () => {
    const { rerender } = setup({ searchValue: '', page: 3 });
    rerender({ searchValue: 'Row', page: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(pageBox()).toHaveValue(3);
  });
});

describe('controlled filters', () => {
  it('treats a fresh array value with the same items as no change', () => {
    const { container } = render(<FreshArrayParent />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(pageBox()).toHaveValue(2);
    expect(names(container)[0]).toBe('Row 6');
  });

  it('renders the filters prop and reports a change with the move to page 1', () => {
    const onFiltersChange = vi.fn();
    const onPageChange = vi.fn();
    const { container } = setup({ filters: { state: 'tx' }, defaultPage: 2, onFiltersChange, onPageChange });
    expect(names(container)[0]).toBe('Row 26');
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'ny' } });
    expect(onFiltersChange).toHaveBeenCalledExactlyOnceWith({ state: 'ny' });
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
    // The filters stay the prop's; the uncontrolled page moved to 1.
    expect(names(container)[0]).toBe('Row 16');
  });

  it('goes to page 1 and reports it when the parent changes the filters', () => {
    const onPageChange = vi.fn();
    const { container, rerender } = setup({ filters: {}, defaultPage: 2, onPageChange });
    rerender({ filters: { state: 'tx' }, defaultPage: 2, onPageChange });
    expect(names(container)[0]).toBe('Row 16');
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });
});

describe('parent changes keep the rest of the state', () => {
  it('keeps the chosen page size and the typed search when the parent changes the filters', () => {
    const { rerender } = setup({ filters: {}, pageSizeOptions: [10, 25] });
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
    fireEvent.change(searchBox(), { target: { value: 'typing' } });
    rerender({ filters: { state: 'tx' }, pageSizeOptions: [10, 25] });
    expect(screen.getByLabelText('Rows per page')).toHaveValue('25');
    expect(searchBox()).toHaveValue('typing');
  });
});

describe('controlled search', () => {
  it('shows the typed text and reports only the applied, debounced value', () => {
    const onSearchChange = vi.fn();
    const { container } = setup({ searchValue: '', onSearchChange });
    fireEvent.change(searchBox(), { target: { value: 'Row 2' } });
    fireEvent.change(searchBox(), { target: { value: 'Row 3' } });
    expect(searchBox()).toHaveValue('Row 3');
    advance(250);
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('Row 3');
    // The parent did not take the value: the rows still follow the prop.
    expect(names(container)).toHaveLength(10);
  });

  it('shows and applies a search value set by the parent, back on page 1', () => {
    const onPageChange = vi.fn();
    const { container, rerender } = setup({ searchValue: '', defaultPage: 2, onPageChange });
    rerender({ searchValue: 'Row 3', defaultPage: 2, onPageChange });
    expect(searchBox()).toHaveValue('Row 3');
    expect(names(container)).toEqual(['Row 3', 'Row 30']);
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('reports page 1 once when the parent changes the search under a controlled page', () => {
    const onPageChange = vi.fn();
    const { container, rerender } = setup({ searchValue: '', page: 3, onPageChange });
    rerender({ searchValue: 'Row 3', page: 3, onPageChange });
    expect(names(container)).toEqual(['Row 3', 'Row 30']);
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('treats a parent value equal to an older proposal as a change once the parent moved on', () => {
    const { rerender } = setup({ searchValue: '' });
    fireEvent.change(searchBox(), { target: { value: 'a' } });
    advance(250);
    rerender({ searchValue: 'b' });
    rerender({ searchValue: 'a' });
    expect(searchBox()).toHaveValue('a');
  });

  it('forgets proposals settled by an echo of a newer one', () => {
    const { rerender } = setup({ searchValue: '' });
    fireEvent.change(searchBox(), { target: { value: 'a' } });
    advance(250);
    fireEvent.change(searchBox(), { target: { value: 'ab' } });
    advance(250);
    rerender({ searchValue: 'ab' });
    rerender({ searchValue: 'a' });
    expect(searchBox()).toHaveValue('a');
  });

  it('clears at once through the clear button', () => {
    const onSearchChange = vi.fn();
    setup({ searchValue: 'Row 3', onSearchChange });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    // The parent rejects the clear: it is still reported once, not again by the debounce.
    advance(1000);
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('');
  });
});

/** A parent that controls every piece of view state and echoes each change back. */
function EchoParent(props: { onRender: () => void; resetKey?: number }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>({});
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  props.onRender();
  return (
    <BTTable
      columns={COLUMNS}
      rows={ROWS}
      pageSize={10}
      resetKey={props.resetKey}
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

describe('a parent echoing every change', () => {
  it('behaves like an uncontrolled table, without render-time updates or loops', () => {
    const error = vi.spyOn(console, 'error');
    const onRender = vi.fn();
    const { container, rerender } = render(<EchoParent onRender={onRender} resetKey={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(pageBox()).toHaveValue(2);
    fireEvent.change(searchBox(), { target: { value: 'Row 2' } });
    advance(100);
    fireEvent.change(searchBox(), { target: { value: 'Row 2' + '5' } });
    advance(250);
    expect(searchBox()).toHaveValue('Row 25');
    expect(names(container)).toEqual(['Row 25']);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'ny' } });
    expect(names(container)).toEqual([]);
    rerender(<EchoParent onRender={onRender} resetKey={2} />);
    expect(searchBox()).toHaveValue('');
    expect(names(container)[0]).toBe('Row 1');
    expect(onRender.mock.calls.length).toBeLessThan(20);
    expect(error).not.toHaveBeenCalled();
  });
});

/** A parent that takes the table's search and filters back only after `lag` ms, like a URL round trip. */
function LateEchoParent({ lag }: { lag: number }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>({});
  const later = <T,>(set: (value: T) => void) => (value: T) => setTimeout(() => set(value), lag);
  return (
    <BTTable
      columns={COLUMNS}
      rows={ROWS}
      pageSize={5}
      searchValue={search}
      onSearchChange={later(setSearch)}
      filters={filters}
      onFiltersChange={later(setFilters)}
    />
  );
}

describe('a parent echoing late', () => {
  it('keeps what the user typed meanwhile', () => {
    render(<LateEchoParent lag={500} />);
    fireEvent.change(searchBox(), { target: { value: 'Ro' } });
    // 'Ro' applies at 250 ms; the parent takes it back at 750 ms, while 'Row' is still being typed.
    advance(600);
    fireEvent.change(searchBox(), { target: { value: 'Row' } });
    advance(160);
    expect(searchBox()).toHaveValue('Row');
  });

  it('recognises a late echo of an older typed value', () => {
    render(<LateEchoParent lag={500} />);
    fireEvent.change(searchBox(), { target: { value: 'R' } });
    advance(300); // 'R' applied at 250 ms, echoed at 750 ms.
    fireEvent.change(searchBox(), { target: { value: 'Ro' } });
    advance(300); // 'Ro' applied at 550 ms, echoed at 1050 ms.
    fireEvent.change(searchBox(), { target: { value: 'Row' } });
    advance(160); // 'R' echoed at 750 ms while 'Row' still waits for its debounce.
    expect(searchBox()).toHaveValue('Row');
  });

  it('keeps the page when an older filters value is echoed late', () => {
    render(<LateEchoParent lag={500} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    advance(100);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'ny' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    advance(450); // the 'tx' echo arrives at 500 ms, the 'ny' one at 600 ms.
    expect(pageBox()).toHaveValue(2);
    advance(100);
    expect(pageBox()).toHaveValue(2);
  });

  it('keeps the page the user moved to meanwhile', () => {
    render(<LateEchoParent lag={500} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    advance(500);
    expect(pageBox()).toHaveValue(2);
  });
});

describe('resetKey', () => {
  it('reports the reset values through the callbacks, back to the defaults', () => {
    const onSearchChange = vi.fn();
    const onFiltersChange = vi.fn();
    const onPageChange = vi.fn();
    const callbacks = { onSearchChange, onFiltersChange, onPageChange, defaultFilters: { state: 'ny' } };
    const { rerender } = setup({ ...callbacks, searchValue: 'Row', filters: { state: 'tx' }, page: 2, resetKey: 1 });
    rerender({ ...callbacks, searchValue: 'Row', filters: { state: 'tx' }, page: 2, resetKey: 2 });
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('');
    expect(onFiltersChange).toHaveBeenCalledExactlyOnceWith({ state: 'ny' });
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('reports once under StrictMode', () => {
    const onPageChange = vi.fn();
    const table = (resetKey: number) => (
      <StrictMode>
        <BTTable columns={COLUMNS} rows={ROWS} pageSize={10} page={2} onPageChange={onPageChange} resetKey={resetKey} />
      </StrictMode>
    );
    const { rerender } = render(table(1));
    rerender(table(2));
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('returns to defaultSearchValue in uncontrolled mode', () => {
    const { rerender } = setup({ defaultSearchValue: 'Row 1', resetKey: 1 });
    fireEvent.change(searchBox(), { target: { value: 'x' } });
    rerender({ defaultSearchValue: 'Row 1', resetKey: 2 });
    expect(searchBox()).toHaveValue('Row 1');
  });
});
