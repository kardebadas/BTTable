import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RowEntry, RowId } from './rowModel';
import { useSelectedRows } from './useSelectedRows';

type Props = { selected: readonly RowId[]; entries: readonly RowEntry<string>[] };

const page = (...ids: number[]): RowEntry<string>[] => ids.map((id, index) => ({ id, index, row: `row ${id}` }));

function setup(initialProps: Props) {
  const { result, rerender } = renderHook(({ selected, entries }: Props) => useSelectedRows(selected, entries), { initialProps });
  const rows = (selected: readonly RowId[]) => result.current(selected);
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

  it('does not know a row selected in the same render its page leaves the screen', () => {
    const { rows, rerender } = setup({ selected: [1], entries: page(1, 2) });
    rerender({ selected: [1, 2], entries: page(3, 4) });
    expect(rows([1, 2])).toEqual(['row 1']);
  });

  it('never maps the rows while nothing is selected, and selection changes make no pass over them', () => {
    let reads = 0;
    const counted = (...ids: number[]) =>
      ids.map((id, index) => ({
        index,
        row: `row ${id}`,
        get id() {
          reads += 1;
          return id;
        },
      }));
    const first = counted(1, 2, 3);
    const { rows, rerender } = setup({ selected: [], entries: first });
    const second = counted(4, 5, 6);
    rerender({ selected: [], entries: second });
    expect(reads).toBe(0);
    rerender({ selected: [4], entries: second });
    rerender({ selected: [4, 5], entries: second });
    expect(reads).toBe(0);
    expect(rows([4, 5])).toEqual(['row 4', 'row 5']);
    expect(rows([])).toEqual([]);
  });
});
