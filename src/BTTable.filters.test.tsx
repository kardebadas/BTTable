import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { Column, Query } from './core/types';

type Visit = { id: number; who: string; at: string; kind: string };

const ROWS: Visit[] = [
  { id: 1, who: 'Ana', at: '2026-01-05T09:07:30', kind: 'a' },
  { id: 2, who: 'Bo', at: '2026-01-05T14:07:00Z', kind: 'b' },
  { id: 3, who: 'Cy', at: '2026-01-05T09:08', kind: 'a' },
];

const COLUMNS: Column<Visit>[] = [
  { key: 'who', header: 'Who' },
  { key: 'at', header: 'At', filter: { type: 'datetime' } },
  { key: 'kind', header: 'Kind', filter: { type: 'multiselect', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] } },
];

const names = (container: HTMLElement) => Array.from(container.querySelectorAll('tr.btt-row td:first-child')).map((cell) => cell.textContent);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BTTable datetime filter', () => {
  it('narrows client rows to the same local minute and Clear all resets it', () => {
    const { container } = render(<BTTable columns={COLUMNS} rows={ROWS} />);
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    fireEvent.change(screen.getByLabelText('At'), { target: { value: '2026-01-05T09:07' } });
    expect(names(container)).toEqual(['Ana', 'Bo']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(names(container)).toEqual(['Ana', 'Bo', 'Cy']);
    expect(screen.getByLabelText('At')).toHaveValue('');
  });

  it('ignores an emptied input', () => {
    const { container } = render(<BTTable columns={COLUMNS} rows={ROWS} />);
    fireEvent.change(screen.getByLabelText('At'), { target: { value: '2026-01-05T09:08' } });
    expect(names(container)).toEqual(['Cy']);
    fireEvent.change(screen.getByLabelText('At'), { target: { value: '' } });
    expect(names(container)).toEqual(['Ana', 'Bo', 'Cy']);
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  it('sends the local minute and operator in the manual-mode query, debounced like typed filters', () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn<(query: Query) => void>();
    render(<BTTable columns={COLUMNS} mode="manual" rows={[]} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByLabelText('At'), { target: { value: '2026-01-05T09:07' } });
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onQueryChange.mock.lastCall?.[0].filters).toEqual({ at: { type: 'datetime', op: 'on', value: '2026-01-05T09:07' } });
  });
});

describe('BTTable multiselect portal', () => {
  it('portals the filter popover out of the table into portalContainer, themed like the table', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const { container: host } = render(<BTTable columns={COLUMNS} rows={ROWS} className="btt-theme-dark" portalContainer={container} />);
    fireEvent.click(screen.getByLabelText('Kind'));
    const popover = container.querySelector('.btt-multiselect-popover') as HTMLElement;
    expect(popover).not.toBeNull();
    expect(host.querySelector('.btt-multiselect-popover')).toBeNull();
    expect(popover).toHaveClass('btt-theme-dark');
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));
    expect(names(host)).toEqual(['Bo']);
    container.remove();
  });
});
