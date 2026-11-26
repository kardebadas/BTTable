import { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import type { BTTableHandle } from './hooks/useTableHandle';
import {
  COLUMNS,
  geometry,
  installFakeGeometry,
  MockResizeObserver,
  mountedIds,
  range,
  type Row,
  rowElement,
  rowProps,
  ROWS_1000,
  scroller,
  scrollTo,
  spacers,
} from './testing/virtualFixture';

installFakeGeometry();

const detail = ({ row }: { row: Row }) => <div>{`Detail ${row.id}`}</div>;

/** 1000 rows of 40 px, virtualized, row 0 expanded with a detail row of `detailHeight` px. */
function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  for (const id of range(0, 1000)) geometry.heights.set(id, 40);
  geometry.detailHeight = 160;
  const ref = createRef<BTTableHandle>();
  const view = render(
    <BTTable ref={ref} columns={COLUMNS} rows={ROWS_1000} pagination={false} rowProps={rowProps} renderDetail={detail} defaultExpandedIds={[0]} {...props} />,
  );
  return { ...view, handle: () => ref.current as BTTableHandle };
}

const TOTAL = 999 * 40 + 200;

describe('virtualized detail rows', () => {
  it('measure a data row and its detail row as one unit', () => {
    const { container } = setup();
    // Row 0 with its detail fills the 200 px viewport: row 1 touches its bottom, 8 more below.
    expect(mountedIds(container)).toEqual(range(0, 10));
    expect(spacers(container)).toEqual({ top: null, bottom: `${TOTAL - (200 + 9 * 40)}px` });
    expect(container.querySelectorAll('tr.btt-row')).toHaveLength(10);
  });

  it('re-measure the unit when the detail row resizes', () => {
    const { container } = setup();
    const detailRow = container.querySelector('tr.btt-detail-row') as HTMLElement;
    const observer = MockResizeObserver.instances.at(-1) as MockResizeObserver;
    expect(observer.observed.has(detailRow)).toBe(true);
    // The detail row alone is now as tall as the whole unit was: only the unit's height changed.
    geometry.detailHeight = 200;
    observer.trigger([detailRow]);
    // Row 0 now covers the whole viewport: 8 rows of overscan below it.
    expect(mountedIds(container)).toEqual(range(0, 9));
    expect(spacers(container).bottom).toBe(`${TOTAL + 40 - (240 + 8 * 40)}px`);
  });

  it('re-measure the unit when a row opens or closes', () => {
    const { container } = setup({ defaultExpandedIds: [] });
    expect(mountedIds(container)).toEqual(range(0, 14));
    fireEvent.click(container.querySelector('.btt-expand') as HTMLElement);
    expect(mountedIds(container)).toEqual(range(0, 10));
    fireEvent.click(container.querySelector('.btt-expand') as HTMLElement);
    expect(mountedIds(container)).toEqual(range(0, 14));
  });

  it('drop the cached height of an unmounted row that closes, so spacers stop using its open height', () => {
    const { container, rerender } = setup({ expandedIds: [0] });
    scrollTo(container, 20000);
    expect(mountedIds(container)).not.toContain(0);
    const before = parseFloat(spacers(container).top as string);
    rerender(<BTTable columns={COLUMNS} rows={ROWS_1000} pagination={false} rowProps={rowProps} renderDetail={detail} expandedIds={[]} />);
    expect(parseFloat(spacers(container).top as string)).toBe(before - 160);
  });

  it('scrollToRow lands on the unit offset, below the open detail row', () => {
    const { handle } = setup();
    act(() => {
      handle().scrollToRow(50);
    });
    expect(geometry.scrollTops.get(document.querySelector('.btt-scroll') as Element)).toBe(200 + 49 * 40);
  });

  it('onRowMount sees the data row, never the detail row', () => {
    const onRowMount = vi.fn();
    const { container } = setup({ onRowMount });
    expect(onRowMount).toHaveBeenCalledWith(ROWS_1000[0], rowElement(container, 0), 0);
    for (const [, element] of onRowMount.mock.calls) expect(element).toHaveClass('btt-row');
    expect(scroller(container).querySelectorAll('tr.btt-detail-row')).toHaveLength(1);
  });
});
