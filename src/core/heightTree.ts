/**
 * Row heights by position in a Fenwick (binary indexed) tree: one height changes in
 * O(log n), the offset of a row and the row at an offset are O(log n) too, so a
 * measurement never walks every row.
 */

/** Read access to row offsets: what the virtual window and the handle need. */
export type Offsets = {
  /** Number of rows. */
  readonly count: number;
  /** Top of row `index` in px; `offset(count)` is the height of all rows. */
  offset: (index: number) => number;
  /** Index of the row containing `y` (the last row starting at or above it), clamped to the rows; 0 with no rows. */
  rowAt: (y: number) => number;
};

/** The largest power of two not above `n` (0 for 0). */
function topBit(n: number): number {
  let bit = 1;
  while (bit * 2 <= n) bit *= 2;
  return n === 0 ? 0 : bit;
}

/** Mutable row heights with prefix sums, built once per row list in O(n). */
export class HeightTree implements Offsets {
  readonly count: number;
  private readonly heights: Float64Array;
  private readonly sums: Float64Array;
  private readonly top: number;

  /** Takes ownership of `heights` (one per row, in row order). */
  constructor(heights: Float64Array) {
    const count = heights.length;
    const sums = new Float64Array(count + 1);
    for (let i = 1; i <= count; i += 1) {
      sums[i] += heights[i - 1];
      const parent = i + (i & -i);
      if (parent <= count) sums[parent] += sums[i];
    }
    this.count = count;
    this.heights = heights;
    this.sums = sums;
    this.top = topBit(count);
  }

  /** Height of row `index`. */
  height(index: number): number {
    return this.heights[index];
  }

  /** Sets the height of row `index`; returns the change in px. */
  set(index: number, height: number): number {
    const change = height - this.heights[index];
    if (change === 0) return 0;
    this.heights[index] = height;
    for (let i = index + 1; i <= this.count; i += i & -i) this.sums[i] += change;
    return change;
  }

  /** Top of row `index` (the sum of the rows before it); `offset(count)` is the total. */
  offset(index: number): number {
    let sum = 0;
    for (let i = Math.min(index, this.count); i > 0; i -= i & -i) sum += this.sums[i];
    return sum;
  }

  /** Height of all rows. */
  get total(): number {
    return this.offset(this.count);
  }

  /** The last row starting at or above `y`, by descending the tree; clamped to `[0, count - 1]`. */
  rowAt(y: number): number {
    let position = 0;
    let rest = y;
    for (let step = this.top; step > 0; step = Math.floor(step / 2)) {
      const next = position + step;
      if (next <= this.count && this.sums[next] <= rest) {
        position = next;
        rest -= this.sums[next];
      }
    }
    return Math.max(0, Math.min(position, this.count - 1));
  }
}
