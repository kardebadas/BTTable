import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Column } from '../core/types';
import { useClientTable, type UseClientTableOptions } from './useClientTable';

type Row = { id: number; name: string; age: number | null };

const ROWS: Row[] = [
  { id: 1, name: 'Ana', age: 30 },
  { id: 2, name: 'Bruno', age: null },
  { id: 3, name: 'Carla', age: 25 },
  { id: 4, name: 'Diego', age: 41 },
  { id: 5, name: 'Bea', age: 25 },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', filter: { type: 'text' } },
  { key: 'age', header: 'Age', filter: { type: 'number' } },
];

const many = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `R${i + 1}`, age: i }));

function setup(options: Partial<UseClientTableOptions<Row>> = {}) {
  const initialProps: UseClientTableOptions<Row> = { rows: ROWS, columns: COLUMNS, ...options };
  return renderHook((props: UseClientTableOptions<Row>) => useClientTable(props), { initialProps });
}

const names = (entries: { row: Row }[]) => entries.map((entry) => entry.row.name);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('rows and ids', () => {
  it('assigns ids before filtering, falling back to the original index', () => {
    const rows = [{ name: 'x' }, { name: 'y' }, { name: 'z' }] as unknown as Row[];
    const { result } = setup({ rows });
    act(() => result.current.setFilter('name', 'z'));
    expect(result.current.pageRows.map((entry) => [entry.id, entry.index])).toEqual([[2, 2]]);
  });

  it('uses a custom getRowId and skips null and non-object rows', () => {
    const rows = [null, ROWS[0], 7, ROWS[1]] as unknown as Row[];
    const { result } = setup({ rows, getRowId: (row) => `k${row.id}` });
    expect(result.current.totalRows).toBe(2);
    expect(result.current.pageRows.map((entry) => [entry.id, entry.index])).toEqual([
      ['k1', 1],
      ['k2', 3],
    ]);
  });
});

describe('search', () => {
  it('applies the term after the 250 ms debounce and resets the page', () => {
    const { result } = setup({ rows: many(30), pageSize: 10 });
    act(() => result.current.setPage(3));
    act(() => result.current.setSearch('R1'));
    expect(result.current.searchInput).toBe('R1');
    expect(result.current.search).toBe('');
    expect(result.current.page).toBe(3);
    act(() => vi.advanceTimersByTime(249));
    expect(result.current.search).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.search).toBe('R1');
    expect(result.current.page).toBe(1);
    expect(result.current.filteredRows).toHaveLength(11);
  });

  it('restarts the debounce on every keystroke and honours searchDebounceMs', () => {
    const { result } = setup({ searchDebounceMs: 100 });
    act(() => result.current.setSearch('b'));
    act(() => vi.advanceTimersByTime(80));
    act(() => result.current.setSearch('br'));
    act(() => vi.advanceTimersByTime(80));
    expect(result.current.search).toBe('');
    act(() => vi.advanceTimersByTime(20));
    expect(names(result.current.filteredRows)).toEqual(['Bruno']);
  });

  it('clears the search at once, without waiting for the debounce', () => {
    const { result } = setup({ searchDebounceMs: 1000 });
    act(() => result.current.setSearch('br'));
    act(() => vi.advanceTimersByTime(1000));
    expect(names(result.current.filteredRows)).toEqual(['Bruno']);
    act(() => result.current.setSearch('bru'));
    act(() => result.current.clearSearch());
    expect(result.current.searchInput).toBe('');
    expect(result.current.search).toBe('');
    expect(result.current.filteredRows).toHaveLength(5);
  });

  it('cancels a pending search typed back to the applied term', () => {
    const { result } = setup({ rows: many(30), pageSize: 10 });
    act(() => result.current.setPage(2));
    act(() => result.current.setSearch('x'));
    act(() => result.current.setSearch(''));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.page).toBe(2);
  });
});

describe('filters', () => {
  const withDefaults: Column<Row>[] = [
    { key: 'name', header: 'Name', filter: { type: 'text', defaultValue: 'a' } },
    { key: 'age', header: 'Age', filter: { type: 'notEmpty' } },
  ];

  it('applies defaults once at mount', () => {
    const { result } = setup({ columns: withDefaults });
    expect(result.current.filters).toEqual({ name: 'a' });
    expect(names(result.current.filteredRows)).toEqual(['Ana', 'Carla', 'Bea']);
  });

  it('keeps active filters when the columns identity changes', () => {
    const { result, rerender } = setup({ columns: withDefaults });
    act(() => result.current.setFilter('age', true));
    rerender({ rows: ROWS, columns: [...withDefaults] });
    expect(result.current.filters).toEqual({ name: 'a', age: true });
  });

  it('resets the page when a filter changes', () => {
    const { result } = setup({ rows: many(30), pageSize: 10 });
    act(() => result.current.setPage(3));
    act(() => result.current.setFilter('name', 'R1'));
    expect(result.current.page).toBe(1);
    expect(result.current.filteredRows).toHaveLength(11);
  });
});

describe('sorting', () => {
  it('cycles asc → desc → none, nulls last, and resets nothing', () => {
    const { result } = setup({ pageSize: 2 });
    act(() => result.current.setPage(2));
    act(() => result.current.toggleSort('age'));
    expect(result.current.sort).toEqual({ key: 'age', direction: 'asc' });
    expect(names(result.current.filteredRows)).toEqual(['Carla', 'Bea', 'Ana', 'Diego', 'Bruno']);
    expect(result.current.page).toBe(2);
    act(() => result.current.toggleSort('age'));
    expect(names(result.current.filteredRows)).toEqual(['Diego', 'Ana', 'Carla', 'Bea', 'Bruno']);
    act(() => result.current.toggleSort('age'));
    expect(result.current.sort).toBeNull();
    expect(names(result.current.filteredRows)).toEqual(['Ana', 'Bruno', 'Carla', 'Diego', 'Bea']);
  });

  it('starts ascending when another column is clicked and uses sortValue', () => {
    const columns: Column<Row>[] = [...COLUMNS, { key: 'len', header: 'Len', sortValue: (row) => -row.name.length }];
    const { result } = setup({ columns });
    act(() => result.current.toggleSort('age'));
    act(() => result.current.toggleSort('len'));
    expect(result.current.sort).toEqual({ key: 'len', direction: 'asc' });
    expect(names(result.current.filteredRows)[0]).toBe('Bruno');
  });

  it('leaves rows unsorted when the sort key matches no column', () => {
    const { result } = setup();
    act(() => result.current.toggleSort('missing'));
    expect(names(result.current.filteredRows)).toEqual(['Ana', 'Bruno', 'Carla', 'Diego', 'Bea']);
  });
});

describe('pagination', () => {
  it('pages the sorted, filtered rows and coerces string sizes', () => {
    const { result } = setup({ rows: many(25), pageSize: 10 });
    expect(result.current.pageCount).toBe(3);
    act(() => result.current.setPage(3));
    expect(result.current.pageRows.map((entry) => entry.id)).toEqual([21, 22, 23, 24, 25]);
    act(() => result.current.setPageSize('5' as unknown as number));
    expect(result.current.pageSize).toBe(5);
    expect(result.current.page).toBe(1);
    expect(result.current.pageCount).toBe(5);
  });

  it('clamps out-of-range page requests', () => {
    const { result } = setup({ rows: many(25), pageSize: 10 });
    act(() => result.current.setPage(99));
    expect(result.current.page).toBe(3);
    act(() => result.current.setPage(-4));
    expect(result.current.page).toBe(1);
  });

  it('clamps the page to the last one when the rows shrink', () => {
    const { result, rerender } = setup({ rows: many(50), pageSize: 10 });
    act(() => result.current.setPage(5));
    rerender({ rows: many(15), columns: COLUMNS, pageSize: 10 });
    expect(result.current.page).toBe(2);
    rerender({ rows: many(50), columns: COLUMNS, pageSize: 10 });
    expect(result.current.page).toBe(2);
  });

  it('resyncs the page size from the prop and resets the page', () => {
    const { result, rerender } = setup({ rows: many(50), pageSize: 10 });
    act(() => result.current.setPage(4));
    rerender({ rows: many(50), columns: COLUMNS, pageSize: 25 });
    expect(result.current.pageSize).toBe(25);
    expect(result.current.page).toBe(1);
    expect(result.current.pageRows).toHaveLength(25);
  });

  it('defaults to 100 rows per page and renders every row without pagination', () => {
    expect(setup({ rows: many(150) }).result.current.pageRows).toHaveLength(100);
    const { result } = setup({ rows: many(150), pagination: false });
    expect(result.current.pageRows).toHaveLength(150);
    expect(result.current.pageCount).toBe(1);
  });
});

describe('resetKey', () => {
  it('clears search and filters back to defaults, page to 1, keeps sort and page size', () => {
    const columns: Column<Row>[] = [{ key: 'name', header: 'Name', filter: { type: 'text', defaultValue: 'r' } }, COLUMNS[1]];
    const { result, rerender } = setup({ rows: many(40), columns, pageSize: 5, resetKey: 1 });
    act(() => result.current.setSearch('R'));
    act(() => vi.advanceTimersByTime(250));
    act(() => result.current.setFilter('age', [0, 30]));
    act(() => result.current.toggleSort('age'));
    act(() => result.current.setPageSize(10));
    act(() => result.current.setPage(3));
    rerender({ rows: many(40), columns, pageSize: 5, resetKey: 2 });
    expect(result.current.searchInput).toBe('');
    expect(result.current.search).toBe('');
    expect(result.current.filters).toEqual({ name: 'r' });
    expect(result.current.page).toBe(1);
    expect(result.current.sort).toEqual({ key: 'age', direction: 'asc' });
    expect(result.current.pageSize).toBe(10);
  });
});

describe('onStateChange', () => {
  it('reports the state at mount and after each change, with all filtered rows', () => {
    const onStateChange = vi.fn();
    const { result } = setup({ onStateChange, pageSize: 2 });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    act(() => result.current.setFilter('name', 'b'));
    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange).toHaveBeenLastCalledWith({
      search: '',
      filters: { name: 'b' },
      sort: null,
      page: 1,
      pageSize: 2,
      filteredRows: [ROWS[1], ROWS[4]],
    });
  });

  it('does not repeat for re-renders that change nothing, even with new columns and callback', () => {
    const onStateChange = vi.fn();
    const { rerender } = setup({ onStateChange });
    rerender({ rows: ROWS, columns: [...COLUMNS], onStateChange });
    const latest = vi.fn();
    rerender({ rows: [...ROWS], columns: [...COLUMNS], onStateChange: latest });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(latest).not.toHaveBeenCalled();
    rerender({ rows: ROWS.slice(1), columns: COLUMNS, onStateChange: latest });
    expect(latest).toHaveBeenCalledTimes(1);
  });
});

describe('selection', () => {
  it('select-all covers only the filtered rows, with indeterminate in between', () => {
    const onSelectionChange = vi.fn();
    const { result } = setup({ onSelectionChange });
    act(() => result.current.setFilter('name', 'b'));
    act(() => result.current.selection.toggleAll());
    expect(onSelectionChange).toHaveBeenLastCalledWith([2, 5], [ROWS[1], ROWS[4]]);
    expect(result.current.selection.allSelected).toBe(true);
    act(() => result.current.selection.toggleRow(5));
    expect(result.current.selection.indeterminate).toBe(true);
    expect(result.current.selection.isSelected(2)).toBe(true);
  });

  it('prunes selected ids whose rows vanished', () => {
    const onSelectionChange = vi.fn();
    const { result, rerender } = setup({ defaultSelectedIds: [1, 3], onSelectionChange });
    rerender({ rows: ROWS.slice(1), columns: COLUMNS, onSelectionChange });
    expect(result.current.selection.selectedIds).toEqual([3]);
    expect(onSelectionChange).toHaveBeenCalledWith([3], [ROWS[2]]);
  });

  it('keeps a default selection whose rows have not loaded yet', () => {
    const onSelectionChange = vi.fn();
    const { result, rerender } = setup({ rows: [], defaultSelectedIds: [1], onSelectionChange });
    rerender({ rows: ROWS, columns: COLUMNS, onSelectionChange });
    expect(result.current.selection.selectedIds).toEqual([1]);
    rerender({ rows: [], columns: COLUMNS, onSelectionChange });
    rerender({ rows: ROWS, columns: COLUMNS, onSelectionChange });
    expect(result.current.selection.isSelected(1)).toBe(true);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});

describe('review fixes', () => {
  it('renders with a NaN pageSize or resetKey without looping', () => {
    const { result, rerender } = setup({ pageSize: Number.NaN, resetKey: Number.NaN });
    expect(result.current.pageRows).toHaveLength(5);
    rerender({ rows: ROWS, columns: COLUMNS, pageSize: Number.NaN, resetKey: Number.NaN });
    expect(result.current.page).toBe(1);
  });

  it('stores a string pageSize prop as a number, at mount and on resync', () => {
    const onStateChange = vi.fn();
    const { result, rerender } = setup({ rows: many(60), pageSize: '25' as unknown as number, onStateChange });
    expect(result.current.pageSize).toBe(25);
    expect(onStateChange.mock.lastCall?.[0].pageSize).toBe(25);
    rerender({ rows: many(60), columns: COLUMNS, pageSize: '50' as unknown as number, onStateChange });
    expect(result.current.pageSize).toBe(50);
    expect(onStateChange.mock.lastCall?.[0].pageSize).toBe(50);
  });

  it('ignores setting a filter to its current value', () => {
    const onStateChange = vi.fn();
    const { result } = setup({ rows: many(30), pageSize: 10, onStateChange });
    act(() => result.current.setFilter('name', 'R'));
    act(() => result.current.setPage(2));
    const calls = onStateChange.mock.calls.length;
    const filters = result.current.filters;
    act(() => result.current.setFilter('name', 'R'));
    expect(result.current.filters).toBe(filters);
    expect(result.current.page).toBe(2);
    expect(onStateChange).toHaveBeenCalledTimes(calls);
  });
});
