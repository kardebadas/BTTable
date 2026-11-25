import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import {
  COLUMNS,
  frames,
  geometry,
  installFakeGeometry,
  makeRows,
  MockResizeObserver,
  mountedIds,
  range,
  rowElement,
  rowElements,
  rowProps,
  scroller,
  scrollTo,
  setup,
  spacers,
} from './testing/virtualFixture';

installFakeGeometry();

describe('when virtualization turns on', () => {
  it("'auto' mounts every row up to the threshold of 100", () => {
    const { container } = setup({ rows: makeRows(100) });
    expect(rowElements(container)).toHaveLength(100);
    expect(container.querySelector('.btt-spacer')).toBeNull();
    expect(scroller(container).style.overflowAnchor).toBe('');
  });

  it("'auto' virtualizes above the threshold", () => {
    const { container } = setup({ rows: makeRows(101) });
    expect(rowElements(container)).toHaveLength(14);
    expect(scroller(container).style.overflowAnchor).toBe('none');
  });

  it('honours a custom virtualizeThreshold', () => {
    const { container } = setup({ rows: makeRows(300), virtualizeThreshold: 500 });
    expect(rowElements(container)).toHaveLength(300);
  });

  it('virtualize false mounts every row', () => {
    const { container } = setup({ rows: makeRows(300), virtualize: false });
    expect(rowElements(container)).toHaveLength(300);
  });

  it('virtualize true virtualizes even a few rows', () => {
    const { container } = setup({ rows: makeRows(3), virtualize: true });
    expect(rowElements(container)).toHaveLength(3);
    expect(scroller(container).style.overflowAnchor).toBe('none');
  });

  it("maxHeight 'none' turns it off, even when forced", () => {
    const { container } = setup({ rows: makeRows(300), virtualize: true, maxHeight: 'none' });
    expect(rowElements(container)).toHaveLength(300);
    expect(container.querySelector('.btt-spacer')).toBeNull();
  });

  it('only counts the rows of the current page', () => {
    const { container } = setup({ pagination: true, pageSize: 50 });
    expect(rowElements(container)).toHaveLength(50);
  });
});

describe('the mounted window', () => {
  it('mounts the visible rows plus 8 below at the top, with a bottom spacer for the rest', () => {
    const { container } = setup();
    // Viewport 200 px of 40 px estimates: rows 0..5 touch it, 8 more below.
    expect(mountedIds(container)).toEqual(range(0, 14));
    expect(spacers(container)).toEqual({ top: null, bottom: `${(1000 - 14) * 40}px` });
  });

  it('mounts 8 rows of overscan on both sides after scrolling, between two spacers', () => {
    const { container } = setup();
    scrollTo(container, 2000); // row 50 at the top of the viewport
    expect(mountedIds(container)).toEqual(range(42, 64));
    expect(spacers(container)).toEqual({ top: `${42 * 40}px`, bottom: `${(1000 - 64) * 40}px` });
  });

  it('keeps odd/even striping by position in the whole list', () => {
    const { container } = setup();
    scrollTo(container, 2000);
    expect(rowElement(container, 42)).toHaveClass('btt-row--odd');
    expect(rowElement(container, 43)).toHaveClass('btt-row--even');
  });

  it('renders spacers as one hidden cell spanning every column, without widths', () => {
    const { container } = setup({ selectable: true });
    scrollTo(container, 2000);
    const cells = Array.from(container.querySelectorAll<HTMLTableCellElement>('tr.btt-spacer td'));
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.colSpan).toBe(3);
      expect(cell.style.width).toBe('');
      expect(cell.parentElement).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('never changes the column widths while scrolling', () => {
    const { container } = setup();
    const widths = () => Array.from(container.querySelectorAll<HTMLElement>('col')).map((col) => col.style.width);
    const before = widths();
    scrollTo(container, 20000);
    expect(widths()).toEqual(before);
    expect(container.querySelector('thead')).toBeInTheDocument();
  });

  it('follows viewport height changes reported by the observer', () => {
    const { container } = setup();
    geometry.viewport = 400;
    MockResizeObserver.instances[0].trigger([scroller(container)]);
    expect(mountedIds(container)).toEqual(range(0, 19));
  });

  it('updates once per animation frame however many scroll events arrive', () => {
    const { container } = setup();
    const element = scroller(container);
    element.scrollTop = 1000;
    fireEvent.scroll(element);
    element.scrollTop = 2000;
    fireEvent.scroll(element);
    expect(frames).toHaveLength(1);
    act(() => frames.splice(0).forEach((frame) => frame(0)));
    expect(mountedIds(container)[0]).toBe(42);
  });
});

describe('measured row heights', () => {
  it('replace the estimate for mounted rows before the window is settled', () => {
    for (const id of range(0, 1000)) geometry.heights.set(id, 100);
    const { container } = setup();
    // 100 px rows: rows 0..2 touch the 200 px viewport, plus 8 below.
    expect(mountedIds(container)).toEqual(range(0, 11));
    expect(spacers(container).bottom).toBe(`${(1000 - 11) * 40}px`);
  });

  it('stay cached by row id after a row unmounts', () => {
    for (const id of range(0, 1000)) geometry.heights.set(id, 100);
    const { container } = setup();
    scrollTo(container, 1000); // first visible row 10 (rows 0..10 measured at 100 px)
    scrollTo(container, 0);
    geometry.heights.clear(); // later reads would fall back to the estimate if the cache were lost
    scrollTo(container, 2);
    // Rows 11..21 were measured at 100 px while mounted and keep that height unmounted.
    expect(mountedIds(container)).toEqual(range(0, 11));
    expect(spacers(container).bottom).toBe(`${11 * 100 + (1000 - 22) * 40}px`);
  });

  it('keep the first visible row in place when newly measured rows above it differ from the estimate', () => {
    for (const id of range(0, 1000)) geometry.heights.set(id, 50);
    const { container } = setup();
    // Rows 0..12 are measured at 50 px; the rest are 40 px estimates. scrollTop 2000 is
    // 30 px into row 46 (offset 1970). Mounting rows 38..45 adds 8 × 10 px above it.
    scrollTo(container, 2000);
    expect(scroller(container).scrollTop).toBe(2080);
    expect(mountedIds(container)[0]).toBe(38);
  });

  it('keep the first visible row in place when a mounted row above it resizes later', () => {
    for (const id of range(0, 1000)) geometry.heights.set(id, 50);
    const { container } = setup({ estimatedRowHeight: 50 });
    scrollTo(container, 2510); // row 50, 10 px in
    expect(scroller(container).scrollTop).toBe(2510);
    geometry.heights.set(45, 80);
    MockResizeObserver.instances[0].trigger([rowElement(container, 45)]);
    expect(scroller(container).scrollTop).toBe(2540);
  });

  it('do not move the view when the first visible row or rows below it resize', () => {
    for (const id of range(0, 1000)) geometry.heights.set(id, 50);
    const { container } = setup({ estimatedRowHeight: 50 });
    scrollTo(container, 2510);
    geometry.heights.set(50, 300);
    geometry.heights.set(52, 10);
    MockResizeObserver.instances[0].trigger([rowElement(container, 50), rowElement(container, 52)]);
    expect(scroller(container).scrollTop).toBe(2510);
    expect(mountedIds(container)).toContain(50);
  });

  it('ignore zero heights (hidden rows) and observed elements that are not rows', () => {
    for (const id of range(0, 1000)) geometry.heights.set(id, 50);
    const { container } = setup({ estimatedRowHeight: 50 });
    geometry.heights.set(3, 0);
    // The scroller has a 200 px rect too: only the row filter keeps it out of the heights.
    expect(scroller(container).getBoundingClientRect().height).toBe(200);
    MockResizeObserver.instances[0].trigger([rowElement(container, 3), scroller(container)]);
    expect(spacers(container).bottom).toBe(`${(1000 - 13) * 50}px`);
  });

  it('forget the heights of rows that left the list when the data changes', () => {
    for (const id of range(0, 1000)) geometry.heights.set(id, 100);
    const { container, rerender } = setup();
    scrollTo(container, 1000);
    scrollTo(container, 0); // rows 0..21 measured at 100 px
    const props = { columns: COLUMNS, pagination: false, rowProps };
    rerender(<BTTable {...props} rows={makeRows(1000).map((row) => ({ ...row, id: row.id + 5000 }))} />);
    rerender(<BTTable {...props} rows={makeRows(1000)} />);
    // Back on ids 0..999 the cache starts empty: rows 0..13 are measured again on mount
    // (11 stay mounted); rows 14..21 are estimates again, not their old 100 px.
    expect(mountedIds(container)).toEqual(range(0, 11));
    expect(spacers(container).bottom).toBe(`${3 * 100 + (1000 - 14) * 40}px`);
  });
});

describe('estimatedRowHeight', () => {
  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('falls back to 40 px for %s', (estimatedRowHeight) => {
    const { container } = setup({ estimatedRowHeight });
    expect(mountedIds(container)).toEqual(range(0, 14));
    expect(spacers(container)).toEqual({ top: null, bottom: `${(1000 - 14) * 40}px` });
  });
});

describe('accessibility', () => {
  it('exposes the full row count and each row position, and hides the spacers', () => {
    const { container } = setup();
    scrollTo(container, 2000);
    expect(container.querySelector('table')).toHaveAttribute('aria-rowcount', '1001');
    expect(container.querySelector('thead tr')).toHaveAttribute('aria-rowindex', '1');
    expect(rowElement(container, 42)).toHaveAttribute('aria-rowindex', '44');
    expect(rowElement(container, 63)).toHaveAttribute('aria-rowindex', '65');
    for (const spacer of Array.from(container.querySelectorAll('tr.btt-spacer'))) {
      expect(spacer).toHaveAttribute('aria-hidden', 'true');
      expect(spacer).not.toHaveAttribute('aria-rowindex');
    }
  });
});

describe('robustness', () => {
  it('falls back to estimated heights without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { container } = setup();
    expect(mountedIds(container)).toEqual(range(0, 14));
    scrollTo(container, 2000);
    expect(mountedIds(container)).toEqual(range(42, 64));
  });

  it('disconnects the observer, removes the listener and cancels a pending frame on unmount', () => {
    const { container, unmount } = setup();
    const element = scroller(container);
    fireEvent.scroll(element);
    expect(frames).toHaveLength(1);
    const observer = MockResizeObserver.instances[0];
    const disconnectsBefore = observer.disconnect.mock.calls.length;
    unmount();
    // Every commit disconnects before re-observing, so only a new call proves the unmount cleanup.
    expect(observer.disconnect.mock.calls.length).toBeGreaterThan(disconnectsBefore);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    frames.length = 0;
    fireEvent.scroll(element);
    expect(frames).toHaveLength(0);
  });
});
