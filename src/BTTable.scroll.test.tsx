import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableServerProps } from './BTTableProps';
import { deferredServer, settle } from './testing/serverFixture';
import {
  COLUMNS,
  installFakeGeometry,
  makeRows,
  mountedIds,
  rowProps,
  ROWS_1000,
  scroller,
  scrollTo,
  SERVER_COLUMNS,
  type ServerRow,
  serverRows,
  setup,
} from './testing/virtualFixture';

installFakeGeometry();

describe('scroll position reset', () => {
  it('scrolls back to the top when the rows change order', () => {
    const { container } = setup();
    scrollTo(container, 2000);
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(scroller(container).scrollTop).toBe(0);
    expect(mountedIds(container)[0]).toBe(0);
  });

  it('keeps the position when new rows arrive for the same view (polling)', () => {
    const { container, rerender } = setup();
    scrollTo(container, 2000);
    rerender(<BTTable columns={COLUMNS} rows={makeRows(1000)} pagination={false} rowProps={rowProps} />);
    expect(scroller(container).scrollTop).toBe(2000);
    expect(mountedIds(container)[0]).toBe(42);
  });

  it('keeps the position when columns or getRowId change identity', () => {
    const { container, rerender } = setup();
    scrollTo(container, 2000);
    const props = { rows: ROWS_1000, pagination: false, rowProps };
    rerender(<BTTable {...props} columns={[...COLUMNS]} getRowId={(row) => row.id} />);
    expect(scroller(container).scrollTop).toBe(2000);
  });

  it('scrolls back to the top when the search or a filter is applied', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { container } = setup();
    scrollTo(container, 2000);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'Row' } });
    act(() => vi.advanceTimersByTime(250));
    vi.useRealTimers();
    expect(scroller(container).scrollTop).toBe(0);
  });

  it('scrolls back to the top on resetKey even when nothing was filtered', () => {
    const { container, rerender } = setup();
    scrollTo(container, 2000);
    rerender(<BTTable columns={COLUMNS} rows={ROWS_1000} pagination={false} rowProps={rowProps} resetKey={1} />);
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

describe('scroll position in server mode', () => {
  function setupServer(props: Partial<BTTableServerProps<ServerRow>> = {}) {
    const server = deferredServer();
    const element = (extra: Partial<BTTableServerProps<ServerRow>>) => (
      <BTTable columns={SERVER_COLUMNS} fetchRows={server.fetchRows} pageSize={500} rowProps={rowProps} {...props} {...extra} />
    );
    const view = render(element({}));
    return { ...view, ...server, rerender: (extra: Partial<BTTableServerProps<ServerRow>>) => view.rerender(element(extra)) };
  }

  it('keeps the position when refreshKey answers the same query again', async () => {
    const { container, calls, rerender } = setupServer();
    await settle(calls[0], { rows: serverRows(0, 500), totalRows: 1000 });
    scrollTo(container, 2000);
    rerender({ refreshKey: 1 });
    await settle(calls[1], { rows: serverRows(0, 500), totalRows: 1000 });
    expect(scroller(container).scrollTop).toBe(2000);
  });

  it('scrolls back to the top when the next page arrives', async () => {
    const { container, calls } = setupServer();
    await settle(calls[0], { rows: serverRows(0, 500), totalRows: 1000 });
    scrollTo(container, 2000);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { rows: serverRows(500, 500), totalRows: 1000 });
    expect(scroller(container).scrollTop).toBe(0);
  });
});
