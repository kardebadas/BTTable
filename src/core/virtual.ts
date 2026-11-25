/**
 * Row virtualization math. Pure functions over an offsets array: `offsets[i]` is the top
 * of row `i` in px and `offsets[n]` the height of all `n` rows.
 */

/** Prefix sums of the row heights: `n + 1` offsets, from 0 to the total height. */
export function rowOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i += 1) offsets[i + 1] = offsets[i] + heights[i];
  return offsets;
}

/**
 * Index of the row containing position `y` (the last row starting at or above it), by
 * binary search, clamped to the rows that exist. 0 when there are no rows.
 */
export function rowAt(offsets: readonly number[], y: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= y) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** The mounted rows `[start, end)` and the spacer heights above and below them. */
export type VirtualWindow = { start: number; end: number; padTop: number; padBottom: number };

/** Input of `virtualWindow`. */
export type VirtualWindowInput = {
  offsets: readonly number[];
  scrollTop: number;
  viewportHeight: number;
  /** Extra rows mounted on each side of the visible ones. */
  overscan: number;
};

/** The rows touching the viewport plus `overscan` rows on both sides, with spacers for the rest. */
export function virtualWindow({ offsets, scrollTop, viewportHeight, overscan }: VirtualWindowInput): VirtualWindow {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const start = Math.max(0, rowAt(offsets, scrollTop) - overscan);
  const end = Math.min(count, rowAt(offsets, scrollTop + viewportHeight) + 1 + overscan);
  return { start, end, padTop: offsets[start], padBottom: offsets[count] - offsets[end] };
}

/** Input of `anchoredScrollTop`: the same rows' offsets before and after a height change. */
export type AnchorInput = { before: readonly number[]; after: readonly number[]; scrollTop: number };

/**
 * The scroll position that keeps the first visible row where it was on screen after the
 * heights of rows above it changed. Unchanged when the row count differs (a new list).
 */
export function anchoredScrollTop({ before, after, scrollTop }: AnchorInput): number {
  if (before.length !== after.length) return scrollTop;
  const anchor = rowAt(before, scrollTop);
  return after[anchor] + (scrollTop - before[anchor]);
}

/** `virtualize` prop: `'auto'` turns virtualization on above the row threshold. */
export type VirtualizeMode = 'auto' | boolean;

/** Input of `shouldVirtualize`. */
export type VirtualizeInput = {
  virtualize: VirtualizeMode;
  maxHeight: number | string;
  rowCount: number;
  threshold: number;
};

/** Whether to virtualize: never without an inner scroll (`maxHeight: 'none'`), else per `virtualize`. */
export function shouldVirtualize({ virtualize, maxHeight, rowCount, threshold }: VirtualizeInput): boolean {
  if (maxHeight === 'none') return false;
  if (virtualize === 'auto') return rowCount > threshold;
  return virtualize;
}
