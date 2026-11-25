import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { BTTable } from '../BTTable';
import type { BTTableClientProps } from '../BTTableProps';
import type { RowAttributes } from '../components/TableBody';
import type { Column } from '../core/types';
import type { Row as FixtureRow } from './serverFixture';

export type Row = { id: number; name: string };
export type ServerRow = FixtureRow;

export const COLUMNS: Column<Row>[] = [
  { key: 'id', header: 'Id', width: 80 },
  { key: 'name', header: 'Name' },
];
export const rowProps = (row: Row): RowAttributes => ({ 'data-row-id': row.id });
export const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, id) => ({ id, name: `Row ${id}` }));
export const ROWS_1000 = makeRows(1000);
export const SERVER_COLUMNS: Column<ServerRow>[] = [{ key: 'name', header: 'Name' }];
export const serverRows = (first: number, count: number): ServerRow[] => makeRows(count).map((row) => ({ ...row, id: row.id + first, state: 'ny' }));

/** Fake geometry: row heights by id (unknown → 0, i.e. unmeasurable), the viewport height, scroll positions. */
export const geometry = { heights: new Map<number, number>(), viewport: 200, scrollTops: new WeakMap<Element, number>() };
/** Animation frame callbacks queued by the table, run by `scrollTo`. */
export const frames: FrameRequestCallback[] = [];

export class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observed = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
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

/** Installs the fake geometry, ResizeObserver and animation frames around every test of the calling file. */
export function installFakeGeometry(): void {
  beforeEach(() => {
    geometry.heights.clear();
    geometry.viewport = 200;
    frames.length = 0;
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
}

export function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  return render(<BTTable columns={COLUMNS} rows={ROWS_1000} pagination={false} rowProps={rowProps} {...props} />);
}

export const scroller = (container: HTMLElement) => container.querySelector('.btt-scroll') as HTMLElement;
export const rowElements = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('tbody tr.btt-row'));
export const mountedIds = (container: HTMLElement) => rowElements(container).map((row) => Number(row.dataset.rowId));
export const rowElement = (container: HTMLElement, id: number) =>
  container.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement;

export function spacers(container: HTMLElement) {
  const tbody = container.querySelector('tbody') as HTMLElement;
  const height = (row: Element | null) => (row?.classList.contains('btt-spacer') ? (row as HTMLElement).style.height : null);
  return { top: height(tbody.firstElementChild), bottom: height(tbody.lastElementChild) };
}

export function scrollTo(container: HTMLElement, top: number) {
  const element = scroller(container);
  element.scrollTop = top;
  fireEvent.scroll(element);
  act(() => frames.splice(0).forEach((frame) => frame(0)));
}

export const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
