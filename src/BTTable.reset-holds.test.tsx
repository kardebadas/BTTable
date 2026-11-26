import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import type { Query } from './core/types';
import type { BTTableHandle } from './hooks/useTableHandle';
import { advance, COLUMNS, makeRows, type Row } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Mode = 'server' | 'manual';
type TableProps = { mode: Mode; sent: Query[]; resetKey: number };

/** Lets timers run out and the immediately answered fetches land. */
async function settleAll(): Promise<void> {
  advance(1000);
  await act(async () => {});
}

const nextPage = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const sortByName = () => fireEvent.click(screen.getByRole('button', { name: 'Name' }));

/** A table of 100 rows in pages of 2 whose every query lands in `sent`; server mode answers at once. */
function Table({ mode, sent, resetKey, ...view }: TableProps & Record<string, unknown>) {
  const common = { columns: COLUMNS, pageSize: 2, resetKey, ...view };
  if (mode === 'manual') return <BTTable {...common} mode="manual" rows={makeRows(1, 2)} totalRows={100} onQueryChange={(query) => sent.push(query)} />;
  const fetchRows = (query: Query) => {
    sent.push(query);
    return Promise.resolve({ rows: makeRows(1, 2), totalRows: 100 });
  };
  return <BTTable {...common} fetchRows={fetchRows} />;
}

/** A parent that builds its (never echoed) filters anew on every render. */
function LiteralParent(props: TableProps) {
  return <Table {...props} filters={{ state: 'tx' }} />;
}

/** A parent with a controlled page (3) and search ('Row') that echoes each change 100 ms late. */
function LateEchoParent(props: TableProps) {
  const [page, setPage] = useState(3);
  const [search, setSearch] = useState('Row');
  const later = <T,>(set: (value: T) => void) => (value: T) => setTimeout(() => set(value), 100);
  return <Table {...props} page={page} onPageChange={later(setPage)} searchValue={search} onSearchChange={later(setSearch)} />;
}

describe.each<Mode>(['server', 'manual'])('held filters in %s mode', (mode) => {
  it('stays on the page the user moved to when the parent rebuilds the held filters', async () => {
    const sent: Query[] = [];
    const view = render(<LiteralParent mode={mode} sent={sent} resetKey={0} />);
    await settleAll();
    view.rerender(<LiteralParent mode={mode} sent={sent} resetKey={1} />);
    await settleAll();
    nextPage();
    await settleAll();
    view.rerender(<LiteralParent mode={mode} sent={sent} resetKey={1} />);
    await settleAll();
    expect(sent.map((query) => [query.filters.state?.value ?? null, query.page])).toEqual([['tx', 1], [null, 1], [null, 2]]);
    expect(screen.getByLabelText('Page')).toHaveValue(2);
  });
});

describe.each<Mode>(['server', 'manual'])('held page in %s mode', (mode) => {
  /** Resets, runs `meanwhile` before the late echo and returns the pages sent. */
  async function resetThen(meanwhile: () => void) {
    const sent: Query[] = [];
    const view = render(<LateEchoParent mode={mode} sent={sent} resetKey={0} />);
    await settleAll();
    view.rerender(<LateEchoParent mode={mode} sent={sent} resetKey={1} />);
    advance(10);
    meanwhile();
    await settleAll();
    return sent.map((query) => [query.sort?.key ?? null, query.page]);
  }

  it('keeps page 1 when the sort changes before a late echo', async () => {
    expect(await resetThen(sortByName)).toEqual([[null, 3], [null, 1], ['name', 1]]);
  });

  it('never sends the pre-reset page when the user pages before a late echo', async () => {
    expect(await resetThen(nextPage)).toEqual([[null, 3], [null, 1], [null, 2]]);
    expect(screen.getByLabelText('Page')).toHaveValue(2);
  });
});

describe('client mode', () => {
  // 30 rows in pages of 10; ids 1-15 in 'ny', 16-30 in 'tx'.
  const rows = makeRows(1, 30).map((row) => ({ ...row, state: row.id > 15 ? 'tx' : 'ny' }));
  const handle = createRef<BTTableHandle>();
  const pageBox = () => screen.getByLabelText('Page');

  /** Renders a client table; `rerender` swaps in new props over the same base. */
  function setup(props: Partial<BTTableClientProps<Row>>) {
    const view = render(<BTTable ref={handle} columns={COLUMNS} rows={rows} pageSize={10} {...props} />);
    return (next: Partial<BTTableClientProps<Row>>) => view.rerender(<BTTable ref={handle} columns={COLUMNS} rows={rows} pageSize={10} {...next} />);
  }

  it('stays on the page the user moved to when the parent rebuilds the held filters', () => {
    const rerender = setup({ filters: { state: 'tx' }, resetKey: 0 });
    rerender({ filters: { state: 'tx' }, resetKey: 1 });
    nextPage();
    rerender({ filters: { state: 'tx' }, resetKey: 1 });
    expect(pageBox()).toHaveValue(2);
  });

  it('holds the controlled search and filters on resetView, as a new resetKey does', () => {
    const onSearchChange = vi.fn();
    setup({ searchValue: 'Row 2', filters: { state: 'tx' }, onSearchChange });
    act(() => handle.current?.resetView());
    expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('');
    expect(screen.getByLabelText('State')).toHaveValue('');
    expect(screen.getByText('Row 1')).toBeInTheDocument();
  });

  it('shows the page the user moved to while the page is held', () => {
    const onPageChange = vi.fn();
    const rerender = setup({ searchValue: '', page: 3, onPageChange });
    rerender({ searchValue: 'Row', page: 3, onPageChange });
    nextPage();
    expect(onPageChange).toHaveBeenLastCalledWith(2);
    expect(pageBox()).toHaveValue(2);
  });
});
