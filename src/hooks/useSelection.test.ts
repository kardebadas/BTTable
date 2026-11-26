import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSelection, type SelectionOptions } from './useSelection';

function setup(options: SelectionOptions) {
  return renderHook((props: SelectionOptions) => useSelection(props), { initialProps: options });
}

describe('useSelection', () => {
  it('is uncontrolled from defaultSelectedIds and toggles rows', () => {
    const onSelectionChange = vi.fn();
    const { result } = setup({ scopeIds: [1, 2, 3], defaultSelectedIds: [2], onSelectionChange });
    expect(result.current.selectedIds).toEqual([2]);
    act(() => result.current.toggleRow(3));
    expect(result.current.selectedIds).toEqual([2, 3]);
    act(() => result.current.toggleRow(2));
    expect(result.current.selectedIds).toEqual([3]);
    expect(onSelectionChange.mock.calls).toEqual([[[2, 3], []], [[3], []]]);
  });

  it('is controlled by selectedIds: reports changes and shows only the prop', () => {
    const onSelectionChange = vi.fn();
    const { result, rerender } = setup({ scopeIds: [1, 2], selectedIds: [1], onSelectionChange });
    act(() => result.current.toggleRow(2));
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 2], []);
    expect(result.current.selectedIds).toEqual([1]);
    rerender({ scopeIds: [1, 2], selectedIds: [1, 2], onSelectionChange });
    expect(result.current.allSelected).toBe(true);
  });

  it('toggles all ids in scope, keeping selections outside it, without duplicates', () => {
    const { result } = setup({ scopeIds: [1, 2, 2], defaultSelectedIds: [9, 1] });
    expect(result.current.indeterminate).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([9, 1, 2]);
    expect(result.current.allSelected).toBe(true);
    expect(result.current.indeterminate).toBe(false);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([9]);
  });

  it('is neither all-selected nor indeterminate with an empty scope', () => {
    const { result } = setup({ scopeIds: [], defaultSelectedIds: [1] });
    expect(result.current.allSelected).toBe(false);
    expect(result.current.indeterminate).toBe(false);
  });

  it('asks a controlled owner to drop vanished ids and shows the prop until it does', () => {
    const onSelectionChange = vi.fn();
    const props = { scopeIds: [], selectedIds: [1, 2], onSelectionChange };
    const { result, rerender } = setup({ ...props, presentIds: new Set([1, 2]) });
    rerender({ ...props, presentIds: new Set([2]) });
    expect(onSelectionChange).toHaveBeenCalledWith([2], []);
    expect(result.current.selectedIds).toEqual([1, 2]);
    rerender({ ...props, selectedIds: [2], presentIds: new Set([2]) });
    expect(result.current.selectedIds).toEqual([2]);
  });

  it('keeps every id without presentIds', () => {
    const onSelectionChange = vi.fn();
    const { result, rerender } = setup({ scopeIds: [], defaultSelectedIds: [1, 2], onSelectionChange });
    rerender({ scopeIds: [3], onSelectionChange });
    expect(result.current.selectedIds).toEqual([1, 2]);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('keeps ids whose rows have not arrived yet, and every id while no rows are loaded', () => {
    const onSelectionChange = vi.fn();
    const props = { scopeIds: [], defaultSelectedIds: [1], onSelectionChange };
    const { result, rerender } = setup({ ...props, presentIds: new Set() });
    rerender({ ...props, presentIds: new Set([1, 2]) });
    rerender({ ...props, presentIds: new Set() });
    rerender({ ...props, presentIds: new Set([1, 2]) });
    expect(result.current.selectedIds).toEqual([1]);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('still prunes a row removed across an empty refetch', () => {
    const onSelectionChange = vi.fn();
    const props = { scopeIds: [], defaultSelectedIds: [1, 2], onSelectionChange };
    const { result, rerender } = setup({ ...props, presentIds: new Set([1, 2]) });
    rerender({ ...props, presentIds: new Set() });
    rerender({ ...props, presentIds: new Set([2]) });
    expect(result.current.selectedIds).toEqual([2]);
    expect(onSelectionChange).toHaveBeenCalledWith([2], []);
  });

  it('composes consecutive toggles in one handler, uncontrolled', () => {
    const onSelectionChange = vi.fn();
    const { result } = setup({ scopeIds: [1, 2, 3], onSelectionChange });
    act(() => {
      result.current.toggleRow(1);
      result.current.toggleRow(2);
    });
    expect(result.current.selectedIds).toEqual([1, 2]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 2], []);
  });

  it('composes consecutive toggles in one handler, controlled', () => {
    const onSelectionChange = vi.fn();
    const { result } = setup({ scopeIds: [1, 2, 3], selectedIds: [3], onSelectionChange });
    act(() => {
      result.current.toggleRow(1);
      result.current.toggleAll();
    });
    expect(onSelectionChange.mock.calls).toEqual([[[3, 1], []], [[3, 1, 2], []]]);
  });

  it('keeps the selection object and its toggles stable across unrelated re-renders', () => {
    const scopeIds = [1, 2];
    const { result, rerender } = setup({ scopeIds });
    const first = result.current;
    rerender({ scopeIds, onSelectionChange: vi.fn() });
    expect(result.current).toBe(first);
    act(() => result.current.toggleRow(1));
    expect(result.current).not.toBe(first);
    expect(result.current.toggleRow).toBe(first.toggleRow);
    expect(result.current.toggleAll).toBe(first.toggleAll);
  });

  it('selects and clears a large scope, listing the selected rows only when read', () => {
    let reads = 0;
    const scopeIds = Array.from({ length: 5000 }, (_, i) => i);
    const entries = scopeIds.map((id) => ({
      index: id,
      row: `row ${id}`,
      get id() {
        reads += 1;
        return id;
      },
    }));
    const { result } = setup({ scopeIds, entries });
    act(() => result.current.toggleAll());
    expect(result.current.allSelected).toBe(true);
    expect(result.current.isSelected(4999)).toBe(true);
    expect(result.current.selectedIds).toEqual(scopeIds);
    expect(reads).toBe(0);
    expect(result.current.selectedRows).toHaveLength(5000);
    expect(result.current.selectedRows[4999]).toBe('row 4999');
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.allSelected || result.current.indeterminate).toBe(false);
  });

  it('adds the scope after the distinct selected ids, and keeps them when the scope is empty', () => {
    const { result, rerender } = setup({ scopeIds: [3, 4, 3], defaultSelectedIds: [1, 1, 3] });
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([1, 3, 4]);
    rerender({ scopeIds: [] });
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([1, 3, 4]);
  });
});

