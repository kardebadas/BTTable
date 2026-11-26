import type { Offsets } from './heightTree';

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

/** Offsets over a prefix-sum array as built by `rowOffsets`. */
export function arrayOffsets(offsets: readonly number[]): Offsets {
  return { count: offsets.length - 1, offset: (index) => offsets[index], rowAt: (y) => rowAt(offsets, y) };
}

/** The mounted rows `[start, end)` and the spacer heights above and below them. */
export type VirtualWindow = { start: number; end: number; padTop: number; padBottom: number };

/** Input of `virtualWindow`. */
export type VirtualWindowInput = {
  offsets: Offsets | readonly number[];
  /** Content position (px from the top of the first row) at the top of the viewport. */
  scrollTop: number;
  viewportHeight: number;
  /** Extra rows mounted on each side of the visible ones. */
  overscan: number;
  /** Content position minus scroll position, when the scroll space is scaled (see `scrollMap`). Default 0. */
  delta?: number;
  /** Height the rows take in the scroll container. Default: their total height. */
  space?: number;
};

/**
 * The rows touching the viewport plus `overscan` rows on both sides, with spacers for the
 * rest: real-pixel rows placed `delta` px above their content offset in a body `space` px tall.
 */
export function virtualWindow(input: VirtualWindowInput): VirtualWindow {
  const { scrollTop, viewportHeight, overscan, delta = 0 } = input;
  const offsets = 'offset' in input.offsets ? input.offsets : arrayOffsets(input.offsets);
  const count = offsets.count;
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const start = Math.max(0, offsets.rowAt(scrollTop) - overscan);
  const end = Math.min(count, offsets.rowAt(scrollTop + viewportHeight) + 1 + overscan);
  const total = offsets.offset(count);
  // A whole-pixel top spacer and a bottom one taking the rest keep the body exactly `space` tall.
  const padTop = Math.max(0, Math.floor(offsets.offset(start) - delta));
  const mounted = offsets.offset(end) - offsets.offset(start);
  return { start, end, padTop, padBottom: Math.max(0, (input.space ?? total) - padTop - mounted) };
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
