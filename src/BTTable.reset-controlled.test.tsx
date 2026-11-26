import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
type ParentProps = { mode: Mode; echo: boolean; controlled: boolean; sent: Query[]; resetKey: number; echoDelay?: number };

/**
 * A parent with search 'Row' and the 'tx' filter, controlled (echoing each change, or
 * ignoring it) or uncontrolled. Every query the table sends lands in `sent`.
 */
function Parent({ mode, echo, controlled, sent, resetKey, echoDelay }: ParentProps) {
  const [filters, setFilters] = useState<FilterState>({ state: 'tx' });
  const [search, setSearch] = useState('Row');
  const [server] = useState(() => deferredServer());
  const answer = <T,>(set: (value: T) => void) => {
    if (!echo) return undefined;
    return echoDelay === undefined ? set : (value: T) => setTimeout(() => set(value), echoDelay);
  };
  const view = controlled
    ? { filters, searchValue: search, onFiltersChange: answer(setFilters), onSearchChange: answer(setSearch) }
    : { defaultFilters: { state: 'tx' }, defaultSearchValue: 'Row' };
  const common = { columns: COLUMNS, resetKey, ...view };
  if (mode === 'manual') return <BTTable {...common} mode="manual" rows={makeRows(1, 2)} totalRows={2} onQueryChange={(query) => sent.push(query)} />;
  const fetchRows = (query: Query, options: { signal: AbortSignal }) => {
    sent.push(query);
    return server.fetchRows(query, options);
  };
  return <BTTable {...common} fetchRows={fetchRows} />;
}

/**
 * Renders the parent, bumps `resetKey`, runs `meanwhile` before any delayed echo and returns
 * the queries sent (search, state filter, sort key).
 */
function resetOnce(props: Omit<ParentProps, 'sent' | 'resetKey'>, meanwhile = () => {}) {
  const sent: Query[] = [];
  const view = render(<Parent {...props} sent={sent} resetKey={0} />);
  advance(1000);
  view.rerender(<Parent {...props} sent={sent} resetKey={1} />);
  advance(10);
  meanwhile();
  advance(1000);
  return sent.map((query) => [query.search, query.filters.state?.value ?? null, query.sort?.key ?? null]);
}

const sortByName = () => fireEvent.click(screen.getByRole('button', { name: 'Name' }));
const filterNy = () => fireEvent.change(screen.getByLabelText('State'), { target: { value: 'ny' } });

const BEFORE = ['Row', 'tx', null];
const AFTER_RESET = [BEFORE, ['', null, null]];

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
    expect(resetOnce({ mode, echo: false, controlled: false })).toEqual([BEFORE, BEFORE]);
  });

  it('keeps the reset values when a filter changes before a late echo', () => {
    expect(resetOnce({ mode, echo: true, controlled: true, echoDelay: 100 }, filterNy)).toEqual([...AFTER_RESET, ['', 'ny', null]]);
  });

  it('keeps the reset values when the sort changes before a late echo', () => {
    expect(resetOnce({ mode, echo: true, controlled: true, echoDelay: 100 }, sortByName)).toEqual([...AFTER_RESET, ['', null, 'name']]);
  });

  it('keeps the reset values in the query on a sort when the parent never echoes', () => {
    expect(resetOnce({ mode, echo: false, controlled: true }, sortByName)).toEqual([...AFTER_RESET, ['', null, 'name']]);
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('');
  });
});
