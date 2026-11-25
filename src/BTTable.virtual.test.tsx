import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable, type BTTableProps } from './BTTable';
import type { RowAttributes } from './components/TableBody';
import type { Column } from './core/types';

type Row = { id: number; name: string };

const COLUMNS: Column<Row>[] = [
  { key: 'id', header: 'Id', width: 80 },
  { key: 'name', header: 'Name' },
];
const rowProps = (row: Row): RowAttributes => ({ 'data-row-id': row.id });
const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, id) => ({ id, name: `Row ${id}` }));
const ROWS_1000 = makeRows(1000);

/** Fake geometry: row heights by id (unknown → 0, i.e. unmeasurable), the viewport height, scroll positions. */
const geometry = { heights: new Map<number, number>(), viewport: 200, scrollTops: new WeakMap<Element, number>() };
let frames: FrameRequestCallback[] = [];

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observed = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect = vi.fn(() => this.observed.clear());
  /** Delivers a resize of the given elements, like the browser would: only for observed ones. */
  trigger(targets: Element[]) {
    const records = targets.filter((target) => this.observed.has(target)).map((target) => ({ target }));
    if (records.length === 0) return;
    act(() => this.callback(records as ResizeObserverEntry[], this as never));
  }
}

function mockGeometry() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = (this as HTMLElement).dataset?.rowId;
    let height = id === undefined ? 0 : (geometry.heights.get(Number(id)) ?? 0);
    if (this.classList.contains('btt-scroll')) height = geometry.viewport;
    return { height, width: 100, top: 0, left: 0, bottom: height, right: 100, x: 0, y: 0, toJSON: () => ({}) };
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('btt-scroll') ? geometry.viewport : 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
    return geometry.scrollTops.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
    geometry.scrollTops.set(this, value);
  });
}

beforeEach(() => {
  geometry.heights.clear();
  geometry.viewport = 200;
  frames = [];
  MockResizeObserver.instances = [];
  mockGeometry();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(props: Partial<BTTableProps<Row>> = {}) {
  return render(<BTTable columns={COLUMNS} rows={ROWS_1000} pagination={false} rowProps={rowProps} {...props} />);
}

const scroller = (container: HTMLElement) => container.querySelector('.btt-scroll') as HTMLElement;
const rowElements = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('tbody tr.btt-row'));
const mountedIds = (container: HTMLElement) => rowElements(container).map((row) => Number(row.dataset.rowId));
const rowElement = (container: HTMLElement, id: number) =>
  container.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement;

function spacers(container: HTMLElement) {
  const tbody = container.querySelector('tbody') as HTMLElement;
  const height = (row: Element | null) => (row?.classList.contains('btt-spacer') ? (row as HTMLElement).style.height : null);
  return { top: height(tbody.firstElementChild), bottom: height(tbody.lastElementChild) };
}

function scrollTo(container: HTMLElement, top: number) {
  const element = scroller(container);
  element.scrollTop = top;
  fireEvent.scroll(element);
  act(() => frames.splice(0).forEach((frame) => frame(0)));
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

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

describe('scroll position reset', () => {
  it('scrolls back to the top when the rows change order', () => {
    const { container } = setup();
    scrollTo(container, 2000);
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(scroller(container).scrollTop).toBe(0);
    expect(mountedIds(container)[0]).toBe(0);
  });

  it('scrolls back to the top when new data arrives', () => {
    const { container, rerender } = setup();
    scrollTo(container, 2000);
    rerender(<BTTable columns={COLUMNS} rows={makeRows(1000)} pagination={false} rowProps={rowProps} />);
    expect(scroller(container).scrollTop).toBe(0);
  });

  it('keeps the position on an unrelated re-render', () => {
    const { container, rerender } = setup();
    scrollTo(container, 2000);
    rerender(<BTTable columns={COLUMNS} rows={ROWS_1000} pagination={false} rowProps={rowProps} loading />);
    expect(scroller(container).scrollTop).toBe(2000);
    expect(mountedIds(container)[0]).toBe(42);
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
    frames = [];
    fireEvent.scroll(element);
    expect(frames).toHaveLength(0);
  });
});
