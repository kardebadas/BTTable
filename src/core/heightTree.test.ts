import { describe, expect, it } from 'vitest';
import { HeightTree } from './heightTree';
import { arrayOffsets, rowOffsets } from './virtual';

const treeOf = (heights: number[]) => new HeightTree(Float64Array.from(heights));

describe('HeightTree', () => {
  it('gives the prefix sums of the heights, the total last', () => {
    const tree = treeOf([10, 20, 5]);
    expect([0, 1, 2, 3].map((i) => tree.offset(i))).toEqual([0, 10, 30, 35]);
    expect(tree.total).toBe(35);
    expect(tree.count).toBe(3);
  });

  it('updates one height and every offset after it', () => {
    const tree = treeOf([10, 20, 5, 7]);
    expect(tree.set(1, 26)).toBe(6);
    expect(tree.set(1, 26)).toBe(0);
    expect(tree.height(1)).toBe(26);
    expect([0, 1, 2, 3, 4].map((i) => tree.offset(i))).toEqual([0, 10, 36, 41, 48]);
  });

  it('finds the row at a position like rowAt on the prefix sums, zero heights and clamping included', () => {
    const heights = [10, 0, 0, 10, 30, 1, 0];
    const tree = treeOf(heights);
    const offsets = arrayOffsets(rowOffsets(heights));
    for (let y = -5; y < 60; y += 0.5) expect(tree.rowAt(y)).toBe(offsets.rowAt(y));
  });

  it('is empty without rows', () => {
    const tree = treeOf([]);
    expect(tree.total).toBe(0);
    expect(tree.rowAt(100)).toBe(0);
  });

  it('agrees with a full prefix-sum rebuild after many random updates', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const heights = Array.from({ length: 333 }, () => Math.floor(random() * 90) + 1);
    const tree = treeOf(heights);
    for (let step = 0; step < 500; step += 1) {
      const index = Math.floor(random() * heights.length);
      heights[index] = Math.floor(random() * 120);
      tree.set(index, heights[index]);
    }
    const offsets = rowOffsets(heights);
    for (let i = 0; i <= heights.length; i += 1) expect(tree.offset(i)).toBe(offsets[i]);
    for (let y = 0; y < offsets[heights.length]; y += 37) expect(tree.rowAt(y)).toBe(arrayOffsets(offsets).rowAt(y));
  });
});
