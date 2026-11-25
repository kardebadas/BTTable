import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import { BTTable, type BTTableProps } from '../BTTable';
import type { Column, FetchResult, Query } from '../core/types';

/** Test row of the server-mode suites. */
export type Row = { id: number; name: string; state: string };

/** Columns with a text filter on `name` and a select filter on `state`. */
export const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', filter: { type: 'text' } },
  { key: 'state', header: 'State', filter: { type: 'select', options: [{ value: 'ny', label: 'NY' }, { value: 'tx', label: 'TX' }] } },
];

/** One `fetchRows` call: what it was asked, and the handles that settle it. */
export type Call = {
  query: Query;
  signal: AbortSignal;
  resolve: (result: FetchResult<Row>) => void;
  reject: (error: unknown) => void;
};

/** `count` rows with ids from `first`, named `Row <id>`. */
export function makeRows(first: number, count: number): Row[] {
  return Array.from({ length: count }, (_, offset) => ({ id: first + offset, name: `Row ${first + offset}`, state: 'ny' }));
}

/** A `fetchRows` mock whose every call returns a pending promise settled by the test (it ignores `signal`). */
export function deferredServer() {
  const calls: Call[] = [];
  const fetchRows = vi.fn(
    (query: Query, { signal }: { signal: AbortSignal }) =>
      new Promise<FetchResult<Row>>((resolve, reject) => {
        calls.push({ query, signal, resolve, reject });
      }),
  );
  return { calls, fetchRows };
}

/** Settles a call inside `act`, flushing the promise callbacks and the re-render. */
export async function settle(call: Call, outcome: FetchResult<Row> | { error: unknown }): Promise<void> {
  await act(async () => {
    if ('error' in outcome) call.reject(outcome.error);
    else call.resolve(outcome);
  });
}

/** Advances fake timers inside `act`. */
export function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Renders a server-mode table on a deferred fetcher. */
export function renderServer(props: Partial<BTTableProps<Row>> = {}) {
  const server = deferredServer();
  const view = render(<BTTable columns={COLUMNS} fetchRows={server.fetchRows} {...props} />);
  const rerender = (next: Partial<BTTableProps<Row>>) =>
    view.rerender(<BTTable columns={COLUMNS} fetchRows={server.fetchRows} {...props} {...next} />);
  return { ...view, ...server, rerender };
}

/** The text of the first data cell of every rendered row. */
export function names(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('tbody tr.btt-row:not(.btt-row--empty)')).map(
    (row) => row.querySelector('td:not(.btt-cell--select)')?.textContent ?? null,
  );
}
