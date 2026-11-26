import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import { MAX_SCROLL_SPACE } from './core/scrollMap';
import type { BTTableHandle } from './hooks/useTableHandle';
import { COLUMNS, geometry, installFakeGeometry, makeRows, MockResizeObserver, mountedIds, range, rowElement, rowProps, type Row, scroller, scrollTo, spacers } from './testing/virtualFixture';

installFakeGeometry();

function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  const ref = createRef<BTTableHandle>();
  const view = render(<BTTable ref={ref} columns={COLUMNS} rows={makeRows(1000)} pagination={false} rowProps={rowProps} {...props} />);
  return { ...view, handle: () => ref.current as BTTableHandle };
}

const px = (value: string | null) => (value === null ? 0 : parseFloat(value));

/** Height of the body as rendered: both spacers plus the mounted rows (all `rowHeight` tall). */
function bodyHeight(container: HTMLElement, rowHeight: number): number {
  const { top, bottom } = spacers(container);
  return px(top) + px(bottom) + mountedIds(container).length * rowHeight;
}

describe('rows taller than the browsers allow (scaled scroll space)', () => {
  // 1000 unmeasurable rows of 20,000 px: 20M px of content.
  const tall = { estimatedRowHeight: 20_000 };

  it('caps the body at MAX_SCROLL_SPACE', () => {
    const { container } = setup(tall);
    expect(bodyHeight(container, 20_000)).toBe(MAX_SCROLL_SPACE);
  });

  it('shows the last row at the largest scroll position', () => {
    const { container } = setup(tall);
    scrollTo(container, MAX_SCROLL_SPACE - 200);
    expect(mountedIds(container)).toContain(999);
    expect(bodyHeight(container, 20_000)).toBe(MAX_SCROLL_SPACE);
  });

  it('maps a jump linearly onto the content', () => {
    const { container } = setup(tall);
    scrollTo(container, (MAX_SCROLL_SPACE - 200) / 2);
    expect(mountedIds(container)).toContain(499);
  });

  it('moves the content 1 px per px on a small scroll', () => {
    const { container } = setup(tall);
    scrollTo(container, 7_000_000);
    const screenTop = () => px(spacers(container).top) - scroller(container).scrollTop;
    const first = mountedIds(container)[0];
    const before = screenTop();
    scrollTo(container, 7_000_100);
    expect(mountedIds(container)[0]).toBe(first);
    expect(screenTop()).toBe(before - 100);
  });

  it('scrollToRow reaches the last row', () => {
    const { container, handle } = setup(tall);
    act(() => void handle().scrollToRow(999));
    expect(mountedIds(container)).toContain(999);
    expect(scroller(container).scrollTop).toBeLessThanOrEqual(MAX_SCROLL_SPACE - 200);
  });
});

/** Rows measure 60 px against the 40 px estimate, so the content grows as the bottom rows mount. */
function tallerRows() {
  for (const id of range(0, 1000)) geometry.heights.set(id, 60);
}

describe('the bottom of the list', () => {
  it('stays in view when the rows mounted there measure taller than the estimate', () => {
    tallerRows();
    const { container } = setup();
    scrollTo(container, bodyHeight(container, 60) - 200);
    expect(mountedIds(container)).toContain(999);
    expect(scroller(container).scrollTop).toBe(bodyHeight(container, 60) - 200);
  });

  it('End jumps to the last row, from a cell of the table', () => {
    tallerRows();
    const { container } = setup();
    fireEvent.keyDown(rowElement(container, 2), { key: 'End' });
    expect(mountedIds(container)).toContain(999);
    expect(scroller(container).scrollTop).toBe(bodyHeight(container, 60) - 200);
  });

  it('End after a click in the table, with nothing focused', () => {
    tallerRows();
    const { container } = setup();
    fireEvent.pointerDown(rowElement(container, 2));
    fireEvent.keyDown(document.body, { key: 'End' });
    expect(mountedIds(container)).toContain(999);
  });

  it('leaves End to form controls and to a click elsewhere', () => {
    tallerRows();
    const { container } = setup({ selectable: true });
    fireEvent.keyDown(container.querySelector('tbody input') as Element, { key: 'End' });
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'End' });
    expect(scroller(container).scrollTop).toBe(0);
  });

  it('a thumb drag keeps the scroll height and position while rows grow, and ends at the last row', () => {
    tallerRows();
    const { container } = setup();
    const frozen = bodyHeight(container, 60);
    fireEvent.pointerDown(scroller(container));
    scrollTo(container, frozen - 200);
    expect(scroller(container).scrollTop).toBe(frozen - 200);
    expect(bodyHeight(container, 60)).toBe(frozen);
    expect(mountedIds(container)).toContain(999);
    act(() => void fireEvent.pointerUp(window));
    expect(bodyHeight(container, 60)).toBeGreaterThan(frozen);
    expect(scroller(container).scrollTop).toBe(bodyHeight(container, 60) - 200);
  });
});

const detail = ({ row }: { row: Row }) => <div className="detail-body">{`Detail ${row.id}`}</div>;

/** 1000 rows of 40 px scrolled to the bottom; `screenTop` is row 996's top in the viewport (40 px). */
function atBottom(props: Partial<BTTableClientProps<Row>> = {}) {
  for (const id of range(0, 1000)) geometry.heights.set(id, 40);
  const view = setup({ renderDetail: detail, ...props });
  scrollTo(view.container, 1000 * 40 - 200);
  return { ...view, screenTop: () => 996 * 40 - scroller(view.container).scrollTop };
}

describe('growth from a row the user works with, at the bottom', () => {
  it('opening a detail row keeps that row in place', () => {
    geometry.detailHeight = 160;
    const { container, screenTop } = atBottom();
    expect(screenTop()).toBe(40);
    fireEvent.click(rowElement(container, 996).querySelector('.btt-expand') as HTMLElement);
    expect(screenTop()).toBe(40);
  });

  it('a row pressed and then grown keeps its place', () => {
    const { container, screenTop } = atBottom();
    fireEvent.pointerDown(rowElement(container, 996));
    geometry.heights.set(996, 200);
    MockResizeObserver.instances.at(-1)?.trigger([rowElement(container, 996)]);
    expect(screenTop()).toBe(40);
  });
});

const sizers = (container: HTMLElement) => scroller(container).querySelectorAll(':scope > div[aria-hidden="true"]');

describe('thumb drag freeze', () => {
  it('ends when virtualization turns off and back on mid-drag', () => {
    for (const id of range(0, 3000)) geometry.heights.set(id, 40);
    const rows = makeRows(1000);
    const view = setup({ rows, virtualize: true });
    fireEvent.pointerDown(scroller(view.container));
    view.rerender(<BTTable columns={COLUMNS} rows={rows} pagination={false} rowProps={rowProps} virtualize={false} />);
    view.rerender(<BTTable columns={COLUMNS} rows={makeRows(3000)} pagination={false} rowProps={rowProps} virtualize />);
    expect(bodyHeight(view.container, 40)).toBe(120_000);
  });

  it('a second press replaces the first one and one release ends both', () => {
    const { container } = setup();
    fireEvent.pointerDown(scroller(container));
    fireEvent.pointerDown(scroller(container));
    expect(sizers(container)).toHaveLength(1);
    act(() => void fireEvent.pointerUp(window));
    expect(sizers(container)).toHaveLength(0);
  });

  it.each([['pointercancel', () => fireEvent.pointerCancel(window)], ['window blur', () => fireEvent.blur(window)]])('ends on %s', (_name, end) => {
    const { container } = setup();
    fireEvent.pointerDown(scroller(container));
    act(() => void end());
    expect(sizers(container)).toHaveLength(0);
  });

  it('restores the inline position exactly, priority included', () => {
    const { container } = setup();
    scroller(container).style.setProperty('position', 'static', 'important');
    fireEvent.pointerDown(scroller(container));
    act(() => void fireEvent.pointerUp(window));
    expect(scroller(container).style.getPropertyValue('position')).toBe('static');
    expect(scroller(container).style.getPropertyPriority('position')).toBe('important');
  });

  it('leaves nothing behind when unmounted mid-drag', () => {
    const { container, unmount } = setup();
    const element = scroller(container);
    fireEvent.pointerDown(element);
    unmount();
    expect(element.querySelectorAll(':scope > div[aria-hidden="true"]')).toHaveLength(0);
  });
});

describe('End inside a row', () => {
  it('is left to a detail row', () => {
    tallerRows();
    const { container } = setup({ renderDetail: detail, defaultExpandedIds: [1] });
    fireEvent.keyDown(container.querySelector('.detail-body') as Element, { key: 'End' });
    expect(scroller(container).scrollTop).toBe(0);
  });

  it('is left to an element that scrolls on its own', () => {
    tallerRows();
    const columns = [COLUMNS[0], { key: 'name', header: 'Name', render: () => <div className="own-scroll" style={{ overflowY: 'auto' }} /> }];
    const { container } = setup({ columns });
    const own = container.querySelector('.own-scroll') as HTMLElement;
    Object.defineProperty(own, 'scrollHeight', { value: 500 });
    fireEvent.keyDown(own, { key: 'End' });
    expect(scroller(container).scrollTop).toBe(0);
  });
});

describe('cost per measurement and per lookup', () => {
  it('a scroll that measures new rows does not read every row height', () => {
    const { container } = setup({ rows: makeRows(5000) });
    const get = vi.spyOn(Map.prototype, 'get');
    geometry.heights.set(500, 55);
    scrollTo(container, 20_000);
    expect(get.mock.calls.length).toBeLessThan(1000);
  });

  it('scrollToRow does not scan the rows', () => {
    const { container, handle } = setup();
    const findIndex = vi.spyOn(Array.prototype, 'findIndex');
    act(() => void handle().scrollToRow(700));
    expect(mountedIds(container)).toContain(700);
    const rowScans = findIndex.mock.contexts.filter((list) => (list as unknown[]).length === 1000);
    expect(rowScans).toHaveLength(0);
  });
});
