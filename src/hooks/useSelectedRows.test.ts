import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RowEntry, RowId } from './rowModel';
import { rowsInOrder, useSelectedRows } from './useSelectedRows';

type Props = { selected: readonly RowId[]; entries: readonly RowEntry<string>[] };

const page = (...ids: number[]): RowEntry<string>[] => ids.map((id, index) => ({ id, index, row: `row ${id}` }));

function setup(initialProps: Props) {
  const { result, rerender } = renderHook(({ selected, entries }: Props) => useSelectedRows(selected, entries), { initialProps });
  const rows = (selected: readonly RowId[]) => rowsInOrder(selected, result.current.cache);
  return { rows, rerender };
}

describe('useSelectedRows', () => {
  it('keeps a selected row after its page leaves the screen', () => {
    const { rows, rerender } = setup({ selected: [1], entries: page(1, 2) });
    rerender({ selected: [1], entries: page(3, 4) });
    expect(rows([1])).toEqual(['row 1']);
  });

  it('drops a row from the cache once it is unselected', () => {
    const { rows, rerender } = setup({ selected: [1], entries: page(1, 2) });
    rerender({ selected: [], entries: page(3, 4) });
    rerender({ selected: [1], entries: page(3, 4) });
    expect(rows([1])).toEqual([]);
  });

  it('prefers the row on screen over the cached one, and skips ids never seen', () => {
    const { rows, rerender } = setup({ selected: [1, 9], entries: page(1) });
    rerender({ selected: [1, 9], entries: [{ id: 1, index: 0, row: 'row 1 v2' }] });
    expect(rows([1, 9])).toEqual(['row 1 v2']);
  });
});
