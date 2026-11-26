import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps, BTTableServerProps } from './BTTableProps';
import type { ExportQuery } from './core/types';
import { COLUMNS, makeRows, renderServer, type Row, settle } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** One `fetchAllRows` call and the handles that settle it. */
type AllCall = { query: ExportQuery; signal: AbortSignal; resolve: (rows: unknown) => void; reject: (error: unknown) => void };

/** A `fetchAllRows` mock whose calls stay pending until the test settles them (it ignores `signal`). */
function deferredAll() {
  const calls: AllCall[] = [];
  const fetchAllRows = vi.fn(
    (query: ExportQuery, { signal }: { signal: AbortSignal }) =>
      new Promise<Row[]>((resolve, reject) => {
        calls.push({ query, signal, resolve: resolve as AllCall['resolve'], reject });
      }),
  );
  return { calls, fetchAllRows };
}

async function finish(call: AllCall, outcome: { rows: unknown } | { error: unknown }): Promise<void> {
  await act(async () => {
    if ('error' in outcome) call.reject(outcome.error);
    else call.resolve(outcome.rows);
  });
}

const ALL_ROWS = makeRows(1, 3);
const ALL_DATA = { headers: ['Name', 'State'], rows: ALL_ROWS.map((row) => [row.name, row.state]) };
const pdfButton = () => screen.getByRole('button', { name: /PDF|Exporting/ });
const csvButton = () => screen.getByRole('button', { name: /CSV|Exporting/ });
const status = (container: HTMLElement) => container.querySelector('.btt-export-status');

/** A server table on page 1 of 2, with CSV and PDF buttons and a deferred `fetchAllRows`. */
async function setup(props: Partial<BTTableServerProps<Row>> = {}) {
  const all = deferredAll();
  const onExport = vi.fn();
  const view = renderServer({ exportCsv: true, exportFormats: ['pdf'], onExport, pageSize: 2, fetchAllRows: all.fetchAllRows, ...props });
  await settle(view.calls[0], { rows: makeRows(1, 2), totalRows: 3 });
  return { ...view, ...all, onExport };
}

describe('fetchAllRows (server mode)', () => {
  it('exports every filtered row it returns, asked with the query without paging', async () => {
    const { calls, onExport } = await setup({ defaultSort: { key: 'name', direction: 'desc' } });
    fireEvent.click(pdfButton());
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toEqual({ search: '', sort: { key: 'name', direction: 'desc' }, filters: {} });
    expect(onExport).not.toHaveBeenCalled();
    await finish(calls[0], { rows: ALL_ROWS });
    expect(onExport).toHaveBeenCalledExactlyOnceWith('pdf', ALL_DATA);
  });

  it('shows the busy button with aria-busy and its label, the other buttons disabled', async () => {
    const { calls } = await setup();
    fireEvent.click(pdfButton());
    expect(pdfButton()).toHaveAttribute('aria-busy', 'true');
    expect(pdfButton()).toHaveTextContent('Exporting… (cancel)');
    expect(pdfButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();
    await finish(calls[0], { rows: ALL_ROWS });
    expect(pdfButton()).not.toHaveAttribute('aria-busy');
    expect(pdfButton()).toHaveTextContent('PDF');
    expect(csvButton()).toBeEnabled();
  });

  it('downloads every row as CSV', async () => {
    const createObjectURL = vi.fn((blob: Blob) => (void blob, 'blob:all'));
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { calls } = await setup();
    fireEvent.click(csvButton());
    expect(click).not.toHaveBeenCalled();
    await finish(calls[0], { rows: ALL_ROWS });
    expect(click).toHaveBeenCalledTimes(1);
    expect(await createObjectURL.mock.calls[0][0].text()).toBe('"Name","State"\r\n"Row 1","ny"\r\n"Row 2","ny"\r\n"Row 3","ny"');
  });

  it('cancels on a second click: aborted, and its result never exported', async () => {
    const { calls, onExport } = await setup();
    fireEvent.click(pdfButton());
    fireEvent.click(pdfButton());
    expect(calls[0].signal.aborted).toBe(true);
    expect(pdfButton()).not.toHaveAttribute('aria-busy');
    await finish(calls[0], { rows: ALL_ROWS });
    expect(onExport).not.toHaveBeenCalled();
    fireEvent.click(pdfButton());
    expect(calls).toHaveLength(2);
  });

  it('aborts when the query changes, so a stale result is never exported', async () => {
    const { calls, onExport } = await setup();
    fireEvent.click(pdfButton());
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    expect(calls[0].signal.aborted).toBe(true);
    expect(pdfButton()).not.toHaveAttribute('aria-busy');
    await finish(calls[0], { rows: ALL_ROWS });
    expect(onExport).not.toHaveBeenCalled();
  });

  it('reports nothing when the cancelled request then rejects', async () => {
    const onError = vi.fn();
    const { calls, container } = await setup({ onError });
    fireEvent.click(pdfButton());
    fireEvent.click(pdfButton());
    await finish(calls[0], { error: new DOMException('Aborted', 'AbortError') });
    expect(onError).not.toHaveBeenCalled();
    expect(status(container)).toHaveTextContent('');
  });

  it('aborts on unmount', async () => {
    const { calls, onExport, unmount } = await setup();
    fireEvent.click(pdfButton());
    unmount();
    expect(calls[0].signal.aborted).toBe(true);
    await finish(calls[0], { rows: ALL_ROWS });
    expect(onExport).not.toHaveBeenCalled();
  });

  it('reports a failure to onError and in a status message, cleared by the next export', async () => {
    const onError = vi.fn();
    const { calls, container } = await setup({ onError });
    expect(status(container)).toHaveAttribute('role', 'status');
    expect(status(container)).toHaveTextContent('');
    fireEvent.click(pdfButton());
    const failure = new Error('offline');
    await finish(calls[0], { error: failure });
    expect(onError).toHaveBeenCalledWith(failure, expect.anything());
    expect(status(container)).toHaveTextContent('The export failed.');
    expect(pdfButton()).toHaveTextContent('PDF');
    fireEvent.click(pdfButton());
    expect(status(container)).toHaveTextContent('');
  });

  it('reports a result that is not an array, and a rejection that is not an Error', async () => {
    const onError = vi.fn();
    const { calls, onExport } = await setup({ onError, labels: { exportError: 'Falhou' } });
    fireEvent.click(pdfButton());
    await finish(calls[0], { rows: { rows: ALL_ROWS } });
    expect(onError.mock.calls[0][0]).toEqual(new TypeError('BTTable: fetchAllRows must resolve to an array of rows.'));
    expect(screen.getByText('Falhou')).toBeInTheDocument();
    fireEvent.click(pdfButton());
    await finish(calls[1], { error: 'nope' });
    expect(onError.mock.calls[1][0]).toEqual(new Error('nope'));
    expect(onExport).not.toHaveBeenCalled();
    expect(screen.getByText('Falhou')).toBeInTheDocument();
  });

  it('reports an onExport that throws to onError and the status line, never as an unhandled rejection', async () => {
    const onError = vi.fn();
    const failure = new Error('writer crashed');
    const onExport = vi.fn(() => {
      throw failure;
    });
    const { calls, container } = await setup({ onError, onExport });
    fireEvent.click(pdfButton());
    await finish(calls[0], { rows: ALL_ROWS });
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure, expect.anything());
    expect(status(container)).toHaveTextContent('The export failed.');
    expect(pdfButton()).toHaveTextContent('PDF');
  });

  it('still delivers an export that settles after a page change (same search, filters and sort)', async () => {
    const { calls, fetchRows, onExport } = await setup();
    fireEvent.click(pdfButton());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(calls[0].signal.aborted).toBe(false);
    await finish(calls[0], { rows: ALL_ROWS });
    expect(onExport).toHaveBeenCalledExactlyOnceWith('pdf', ALL_DATA);
  });

  it('labels the busy button from labels.exportBusy', async () => {
    await setup({ labels: { exportBusy: 'A exportar…' } });
    fireEvent.click(pdfButton());
    expect(screen.getByRole('button', { name: 'A exportar…' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('without fetchAllRows', () => {
  it('server mode exports the current page at once and shows no status line', async () => {
    const onExport = vi.fn();
    const { calls, container } = renderServer({ exportFormats: ['pdf'], onExport, pageSize: 2 });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(onExport).toHaveBeenCalledWith('pdf', { headers: ['Name', 'State'], rows: [['Row 1', 'ny'], ['Row 2', 'ny']] });
    expect(status(container)).toBeNull();
  });
});

describe('fetchAllRows in other modes', () => {
  it('manual mode exports every row it returns', async () => {
    const { calls, fetchAllRows } = deferredAll();
    const onExport = vi.fn();
    render(
      <BTTable columns={COLUMNS} mode="manual" rows={makeRows(1, 2)} totalRows={3} pageSize={2} onQueryChange={vi.fn()} exportFormats={['pdf']} onExport={onExport} fetchAllRows={fetchAllRows} />,
    );
    fireEvent.click(pdfButton());
    expect(calls[0].query).toEqual({ search: '', sort: null, filters: {} });
    await finish(calls[0], { rows: ALL_ROWS });
    expect(onExport).toHaveBeenCalledWith('pdf', ALL_DATA);
  });

  it('client mode ignores it and exports its own filtered rows', () => {
    const { fetchAllRows } = deferredAll();
    const onExport = vi.fn();
    const props = { fetchAllRows } as unknown as Partial<BTTableClientProps<Row>>;
    render(<BTTable columns={COLUMNS} rows={ALL_ROWS} exportFormats={['pdf']} onExport={onExport} {...props} />);
    fireEvent.click(pdfButton());
    expect(fetchAllRows).not.toHaveBeenCalled();
    expect(onExport).toHaveBeenCalledWith('pdf', ALL_DATA);
  });
});
