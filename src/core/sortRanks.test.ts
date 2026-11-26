import { describe, expect, it } from 'vitest';
import { compareValues, sortKey } from './compare';
import { BLANK_SORT_RANK, orderByRanks, sortRanks } from './sortRanks';

/** The reference order: a stable sort with `compareValues`. */
const reference = (values: unknown[], direction: 'asc' | 'desc') => [...values.keys()].sort((a, b) => compareValues(values[a], values[b], direction));

/** The order by ranks, as positions. */
function ranked(values: unknown[], direction: 'asc' | 'desc'): number[] {
  const { ranks, count } = sortRanks(values.map(sortKey));
  return orderByRanks({ items: [...values.keys()], rankOf: (i) => ranks[i], count, direction });
}

/** A deterministic pseudo-random generator, so failures reproduce. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

const POOL: unknown[] = [
  0, -0, 1, -1, 2.5, -2.5, 1e300, -1e-300, Number.MAX_VALUE, Number.MIN_VALUE, Infinity, -Infinity, Number.NaN, 3, 3,
  '3', ' 3 ', '-0.5', '.5', '10.', '1e1', true, false, null, undefined, '', '   ', new Date('nope'),
  new Date(2026, 0, 1), new Date(2026, 0, 1), new Date(1960, 5, 1), '2026-01-01', '1/2/2026', '2025-06-30T10:00',
  'abc', 'ABC', 'é', 'e', 'item 10', 'item 2', 'Item 1', 'b', 'Zeta', 'zeta', ['x', 'y'], { a: 1 },
];

describe('sortRanks + orderByRanks', () => {
  it('give the same order as a stable compareValues sort, in both directions', () => {
    const next = random(7);
    for (let round = 0; round < 40; round += 1) {
      const values = Array.from({ length: 60 }, () => POOL[Math.floor(next() * POOL.length)]);
      expect(ranked(values, 'asc')).toEqual(reference(values, 'asc'));
      expect(ranked(values, 'desc')).toEqual(reference(values, 'desc'));
    }
  });

  it('rank equal keys together: -0 and 0, collator-equal text, the same instant', () => {
    const { ranks, count } = sortRanks([0, -0, 'abc', 'ABC', new Date(5), new Date(5), null].map(sortKey));
    expect(ranks[0]).toBe(ranks[1]);
    expect(ranks[2]).toBe(ranks[3]);
    expect(ranks[4]).toBe(ranks[5]);
    expect(ranks[6]).toBe(BLANK_SORT_RANK);
    expect(count).toBe(3);
  });

  it('order numbers by value across signs and magnitudes', () => {
    const values = [5, -1e-300, -Infinity, 1e-300, 0, -7.25, Infinity, 1e300, -1e300];
    expect(ranked(values, 'asc').map((i) => values[i])).toEqual([-Infinity, -1e300, -7.25, -1e-300, 0, 1e-300, 5, 1e300, Infinity]);
  });

  it('keep blanks last in input order in both directions, and handle no items', () => {
    const values = [null, 2, '', 1];
    expect(ranked(values, 'asc')).toEqual([3, 1, 0, 2]);
    expect(ranked(values, 'desc')).toEqual([1, 3, 0, 2]);
    expect(ranked([], 'asc')).toEqual([]);
  });
});
