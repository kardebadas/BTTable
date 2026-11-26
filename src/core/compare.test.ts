import { describe, expect, it } from 'vitest';
import { compareValues } from './compare';

const sortAsc = (values: unknown[]) => [...values].sort((a, b) => compareValues(a, b));
function permutations(list: unknown[]): unknown[][] {
  if (list.length <= 1) return [list];
  const result: unknown[][] = [];
  list.forEach((item, i) => {
    const rest = list.filter((_, j) => j !== i);
    for (const tail of permutations(rest)) result.push([item, ...tail]);
  });
  return result;
}

const sortDesc = (values: unknown[]) => [...values].sort((a, b) => compareValues(a, b, 'desc'));

describe('compareValues', () => {
  it('compares numbers numerically in both directions', () => {
    expect(sortAsc([10, 2, -1, 0])).toEqual([-1, 0, 2, 10]);
    expect(sortDesc([10, 2, -1, 0])).toEqual([10, 2, 0, -1]);
  });

  it('puts blanks last in both directions', () => {
    const blank = new Date('nope');
    const values = [null, 3, undefined, '', 1, Number.NaN, blank];
    expect(sortAsc(values).slice(0, 2)).toEqual([1, 3]);
    expect(sortDesc(values).slice(0, 2)).toEqual([3, 1]);
    expect(compareValues(null, undefined)).toBe(0);
    expect(compareValues(null, 1, 'desc')).toBeGreaterThan(0);
  });

  it('never returns negative zero for equal values', () => {
    expect(Object.is(compareValues(5, 5, 'desc'), 0)).toBe(true);
  });

  it('compares dates by time, including US date strings', () => {
    expect(sortAsc(['1/2/2026', '12/1/2025', '2025-06-30'])).toEqual(['2025-06-30', '12/1/2025', '1/2/2026']);
    const early = new Date(2026, 0, 1);
    const late = new Date(2026, 0, 2);
    expect(sortAsc([late, early])).toEqual([early, late]);
    expect(compareValues('2026-01-05T10:00', '2026-01-05T09:00')).toBeGreaterThan(0);
  });

  it('compares strings naturally and case-insensitively', () => {
    expect(sortAsc(['item 10', 'item 2', 'Item 1'])).toEqual(['Item 1', 'item 2', 'item 10']);
    expect(compareValues('abc', 'ABC')).toBe(0);
    expect(compareValues('é', 'e')).toBe(0);
  });

  it('compares numeric strings as numbers (shared with the number filter)', () => {
    expect(sortAsc(['1.5', '1.25', '10'])).toEqual(['1.25', '1.5', '10']);
    expect(sortAsc(['-5', '-10'])).toEqual(['-10', '-5']);
    expect(sortAsc([' 3 ', 2, '10.', '.5'])).toEqual(['.5', 2, ' 3 ', '10.']);
    expect(sortAsc(['1e1', 2])).toEqual([2, '1e1']);
  });

  it('is a consistent total order on mixed number / date / text columns', () => {
    const values = ['1/5/2024', '10/1/2023', '2/2024', 'b', 3, '2'];
    const expected = ['2', 3, '10/1/2023', '1/5/2024', '2/2024', 'b'];
    for (const order of permutations(values)) {
      expect(sortAsc(order)).toEqual(expected);
    }
    expect(sortDesc(values)).toEqual([...expected].reverse());
  });

  it('orders booleans false before true', () => {
    expect(sortAsc([true, false])).toEqual([false, true]);
  });

  it('falls back to text for mixed types', () => {
    expect(compareValues(2, 'b')).toBeLessThan(0);
    expect(compareValues('1/5/2026', 'x')).toBeLessThan(0);
  });

  it('keeps the input order of equal values (stable sort)', () => {
    const rows = [
      { n: 1, tag: 'a' },
      { n: 0, tag: 'b' },
      { n: 1, tag: 'c' },
      { n: 0, tag: 'd' },
    ];
    const sorted = [...rows].sort((a, b) => compareValues(a.n, b.n, 'desc'));
    expect(sorted.map((row) => row.tag)).toEqual(['a', 'c', 'b', 'd']);
  });
});
