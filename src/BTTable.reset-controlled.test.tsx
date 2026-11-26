import { cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { FilterState, Query } from './core/types';
import { advance, COLUMNS, deferredServer, makeRows } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Mode = 'server' | 'manual';
type ParentProps = { mode: Mode; echo: boolean; controlled: boolean; sent: Query[]; resetKey: number };

/**
 * A parent with search 'Row' and the 'tx' filter, controlled (echoing each change, or
 * ignoring it) or uncontrolled. Every query the table sends lands in `sent`.
 */
function Parent({ mode, echo, controlled, sent, resetKey }: ParentProps) {
  const [filters, setFilters] = useState<FilterState>({ state: 'tx' });
  const [search, setSearch] = useState('Row');
  const [server] = useState(() => deferredServer());
  const view = controlled
    ? { filters, searchValue: search, onFiltersChange: echo ? setFilters : undefined, onSearchChange: echo ? setSearch : undefined }
    : { defaultFilters: { state: 'tx' }, defaultSearchValue: 'Row' };
  const common = { columns: COLUMNS, resetKey, ...view };
  if (mode === 'manual') return <BTTable {...common} mode="manual" rows={makeRows(1, 2)} totalRows={2} onQueryChange={(query) => sent.push(query)} />;
  const fetchRows = (query: Query, options: { signal: AbortSignal }) => {
    sent.push(query);
    return server.fetchRows(query, options);
  };
  return <BTTable {...common} fetchRows={fetchRows} />;
}

/** Renders the parent, bumps `resetKey` and returns the queries sent (search and state filter). */
function resetOnce(props: Omit<ParentProps, 'sent' | 'resetKey'>) {
  const sent: Query[] = [];
  const view = render(<Parent {...props} sent={sent} resetKey={0} />);
  advance(1000);
  view.rerender(<Parent {...props} sent={sent} resetKey={1} />);
  advance(1000);
  return sent.map((query) => [query.search, query.filters.state?.value ?? null]);
}

const AFTER_RESET = [
  ['Row', 'tx'],
  ['', null],
];

describe.each<Mode>(['server', 'manual'])('resetKey in %s mode', (mode) => {
  it('sends only the reset query when the parent echoes controlled search and filters', () => {
    expect(resetOnce({ mode, echo: true, controlled: true })).toEqual(AFTER_RESET);
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('');
  });

  it('sends the reset query once and keeps it when the parent ignores the echo', () => {
    expect(resetOnce({ mode, echo: false, controlled: true })).toEqual(AFTER_RESET);
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('');
    expect(screen.getByLabelText('State')).toHaveValue('');
  });

  it('sends only the reset query when search and filters are uncontrolled', () => {
    expect(resetOnce({ mode, echo: false, controlled: false })).toEqual([
      ['Row', 'tx'],
      ['Row', 'tx'],
    ]);
  });
});
