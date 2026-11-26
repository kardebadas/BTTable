import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import { COLUMNS, makeRows, renderServer, type Row, settle } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const skeletons = (container: HTMLElement) => Array.from(container.querySelectorAll('tbody tr.btt-skeleton-row'));
const colWidths = (container: HTMLElement) => Array.from(container.querySelectorAll('col')).map((col) => col.getAttribute('style'));

describe('skeleton rows while the first rows load', () => {
  it('draws min(pageSize, 8) hidden placeholder rows, never data rows, instead of the empty message', () => {
    const { container, rerender } = render(<BTTable<Row> columns={COLUMNS} rows={[]} loading selectable />);
    expect(skeletons(container)).toHaveLength(8);
    expect(container.querySelectorAll('tr.btt-row')).toHaveLength(0);
    expect(container.querySelector('.btt-empty')).toBeNull();
    for (const row of skeletons(container)) {
      expect(row).toHaveAttribute('aria-hidden', 'true');
      expect(row.querySelectorAll('td')).toHaveLength(COLUMNS.length + 1);
    }
    rerender(<BTTable<Row> columns={COLUMNS} rows={[]} loading selectable pageSize={3} />);
    expect(skeletons(container)).toHaveLength(3);
    rerender(<BTTable<Row> columns={COLUMNS} rows={[]} selectable pageSize={3} />);
    expect(skeletons(container)).toHaveLength(0);
    expect(container.querySelector('.btt-empty')).not.toBeNull();
  });

  it('falls back to 8 rows for an invalid page size', () => {
    const { container } = render(<BTTable<Row> columns={COLUMNS} rows={[]} loading pageSize={Number.NaN} />);
    expect(skeletons(container)).toHaveLength(8);
  });

  it('shows in server mode until the first page arrives, keeping the column widths', async () => {
    const { container, calls } = renderServer({ pageSize: 2 });
    expect(skeletons(container)).toHaveLength(2);
    const widths = colWidths(container);
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 2 });
    expect(skeletons(container)).toHaveLength(0);
    expect(container.querySelectorAll('tr.btt-row')).toHaveLength(2);
    expect(colWidths(container)).toEqual(widths);
  });

  it('keeps loaded rows instead of skeletons while a later page loads', () => {
    const { container } = render(<BTTable columns={COLUMNS} rows={makeRows(1, 2)} loading />);
    expect(skeletons(container)).toHaveLength(0);
    expect(container.querySelectorAll('tr.btt-row')).toHaveLength(2);
  });
});
