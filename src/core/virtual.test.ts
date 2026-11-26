import { describe, expect, it } from 'vitest';
import { anchoredScrollTop, rowAt, rowOffsets, shouldVirtualize, virtualWindow } from './virtual';

const uniform = (count: number, height: number) => rowOffsets(Array.from({ length: count }, () => height));

describe('rowOffsets', () => {
  it('is the prefix sum of the heights, starting at 0 and ending at the total', () => {
    expect(rowOffsets([10, 20, 5])).toEqual([0, 10, 30, 35]);
  });

  it('is [0] for no rows', () => {
    expect(rowOffsets([])).toEqual([0]);
  });
});

describe('rowAt', () => {
  const offsets = rowOffsets([10, 20, 5]); // rows span [0,10) [10,30) [30,35)

  it('finds the row containing a position', () => {
    expect(rowAt(offsets, 0)).toBe(0);
    expect(rowAt(offsets, 9.9)).toBe(0);
    expect(rowAt(offsets, 15)).toBe(1);
    expect(rowAt(offsets, 34)).toBe(2);
  });

  it('gives a boundary position to the row that starts there', () => {
    expect(rowAt(offsets, 10)).toBe(1);
    expect(rowAt(offsets, 30)).toBe(2);
  });

  it('clamps positions before the first row and past the last row', () => {
    expect(rowAt(offsets, -50)).toBe(0);
    expect(rowAt(offsets, 35)).toBe(2);
    expect(rowAt(offsets, 1e9)).toBe(2);
  });

  it('skips zero-height rows to the last one starting at the position', () => {
    expect(rowAt(rowOffsets([10, 0, 0, 10]), 10)).toBe(3);
  });

  it('is 0 for no rows', () => {
    expect(rowAt([0], 100)).toBe(0);
  });

  it('agrees with a linear scan on uneven heights', () => {
    const heights = Array.from({ length: 200 }, (_, i) => ((i * 37) % 90) + 1);
    const offsets = rowOffsets(heights);
    for (let y = 0; y < offsets[200]; y += 7) {
      let expected = 0;
      while (expected < 199 && offsets[expected + 1] <= y) expected += 1;
      expect(rowAt(offsets, y)).toBe(expected);
    }
  });
});

describe('virtualWindow', () => {
  it('mounts the visible rows plus the overscan on both sides, with spacers for the rest', () => {
    const offsets = uniform(100, 10);
    // Viewport [500, 550) shows rows 50..54.
    const window = virtualWindow({ offsets, scrollTop: 500, viewportHeight: 50, overscan: 8 });
    expect(window).toEqual({ start: 42, end: 64, padTop: 420, padBottom: 360 });
  });

  it('keeps total height: padTop + mounted rows + padBottom = the table', () => {
    const offsets = rowOffsets([5, 80, 12, 300, 40, 7, 7, 90, 15, 60, 33]);
    const window = virtualWindow({ offsets, scrollTop: 100, viewportHeight: 120, overscan: 1 });
    const mounted = offsets[window.end] - offsets[window.start];
    expect(window.padTop + mounted + window.padBottom).toBe(offsets[11]);
  });

  it('clamps the overscan at the top', () => {
    const window = virtualWindow({ offsets: uniform(100, 10), scrollTop: 0, viewportHeight: 50, overscan: 8 });
    expect(window).toEqual({ start: 0, end: 14, padTop: 0, padBottom: 860 });
  });

  it('clamps the overscan at the bottom', () => {
    const window = virtualWindow({ offsets: uniform(100, 10), scrollTop: 950, viewportHeight: 50, overscan: 8 });
    expect(window).toEqual({ start: 87, end: 100, padTop: 870, padBottom: 0 });
  });

  it('uses the real offsets of uneven rows', () => {
    const offsets = rowOffsets([100, 10, 10, 10, 10, 200, 10]);
    // Viewport [105, 135] reaches rows 1..4; one row of overscan each side.
    const window = virtualWindow({ offsets, scrollTop: 105, viewportHeight: 30, overscan: 1 });
    expect(window).toEqual({ start: 0, end: 6, padTop: 0, padBottom: 10 });
  });

  it('mounts the first rows when the viewport has no height yet', () => {
    const window = virtualWindow({ offsets: uniform(50, 10), scrollTop: 0, viewportHeight: 0, overscan: 8 });
    expect(window).toEqual({ start: 0, end: 9, padTop: 0, padBottom: 410 });
  });

  it('is empty for no rows', () => {
    expect(virtualWindow({ offsets: [0], scrollTop: 0, viewportHeight: 500, overscan: 8 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });

  it('copes with a scroll position past the end (a list that just shrank)', () => {
    const window = virtualWindow({ offsets: uniform(10, 10), scrollTop: 5000, viewportHeight: 50, overscan: 2 });
    expect(window).toEqual({ start: 7, end: 10, padTop: 70, padBottom: 0 });
  });
});

describe('anchoredScrollTop', () => {
  const before = rowOffsets([10, 10, 10, 10, 10]);

  it('moves the scroll position by the height change above the first visible row', () => {
    // Row 2 is the first visible row, 3 px scrolled into it; row 0 grew by 25 px.
    const after = rowOffsets([35, 10, 10, 10, 10]);
    expect(anchoredScrollTop({ before, after, scrollTop: 23 })).toBe(48);
  });

  it('moves it back up when rows above shrink', () => {
    const after = rowOffsets([4, 6, 10, 10, 10]);
    expect(anchoredScrollTop({ before, after, scrollTop: 23 })).toBe(13);
  });

  it('ignores height changes of the first visible row and the rows below it', () => {
    const after = rowOffsets([10, 10, 90, 10, 300]);
    expect(anchoredScrollTop({ before, after, scrollTop: 23 })).toBe(23);
  });

  it('keeps the top of the table pinned at scroll position 0', () => {
    const after = rowOffsets([99, 10, 10, 10, 10]);
    expect(anchoredScrollTop({ before, after, scrollTop: 0 })).toBe(0);
  });

  it('keeps the scroll position when the row count changed', () => {
    expect(anchoredScrollTop({ before, after: rowOffsets([50, 50]), scrollTop: 23 })).toBe(23);
  });
});

describe('shouldVirtualize', () => {
  const base = { virtualize: 'auto' as const, maxHeight: 600, rowCount: 101, threshold: 100 };

  it('turns on automatically above the threshold only', () => {
    expect(shouldVirtualize(base)).toBe(true);
    expect(shouldVirtualize({ ...base, rowCount: 100 })).toBe(false);
    expect(shouldVirtualize({ ...base, threshold: 500 })).toBe(false);
  });

  it('follows an explicit true or false whatever the row count', () => {
    expect(shouldVirtualize({ ...base, virtualize: true, rowCount: 3 })).toBe(true);
    expect(shouldVirtualize({ ...base, virtualize: false, rowCount: 5000 })).toBe(false);
  });

  it("is off when maxHeight is 'none' (no inner scroll), even when forced", () => {
    expect(shouldVirtualize({ ...base, maxHeight: 'none' })).toBe(false);
    expect(shouldVirtualize({ ...base, maxHeight: 'none', virtualize: true })).toBe(false);
  });

  it('accepts a CSS string maxHeight', () => {
    expect(shouldVirtualize({ ...base, maxHeight: '50vh' })).toBe(true);
  });
});
