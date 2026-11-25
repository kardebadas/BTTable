import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { matchesSearch, searchText } from './search';
import type { Column } from './types';

type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name' },
  { key: 'count', header: 'Count' },
  { key: 'secret', header: 'Secret', searchable: false },
];

describe('matchesSearch', () => {
  const row = { name: 'Alice Smith', count: 0, secret: 'hidden' };

  it('matches a case-insensitive substring of any searchable column', () => {
    expect(matchesSearch(row, columns, 'SMI')).toBe(true);
    expect(matchesSearch(row, columns, '0')).toBe(true);
    expect(matchesSearch(row, columns, 'bob')).toBe(false);
  });

  it('matches everything for a blank term', () => {
    expect(matchesSearch(row, columns, '')).toBe(true);
    expect(matchesSearch(row, columns, '   ')).toBe(true);
  });

  it('trims the term', () => {
    expect(matchesSearch(row, columns, '  alice ')).toBe(true);
  });

  it('skips columns marked searchable: false', () => {
    expect(matchesSearch(row, columns, 'hidden')).toBe(false);
  });

  it('uses searchValue when given', () => {
    const custom: Column<Row>[] = [{ key: 'name', header: 'Name', searchValue: () => 'override' }];
    expect(matchesSearch(row, custom, 'over')).toBe(true);
    expect(matchesSearch(row, custom, 'alice')).toBe(false);
  });

  it('searches columns with node or empty headers, and element text (#25)', () => {
    const nodeColumns: Column<Row>[] = [
      { key: 'status', header: createElement('i', null, 'icon') },
      { key: 'action', header: '' },
    ];
    const nodeRow = { status: 'Active', action: createElement('button', null, 'Approve now') };
    expect(matchesSearch(nodeRow, nodeColumns, 'active')).toBe(true);
    expect(matchesSearch(nodeRow, nodeColumns, 'approve')).toBe(true);
  });
});

describe('searchText', () => {
  it('adds M/D/YYYY and ISO forms for dates', () => {
    const text = searchText(new Date(2026, 0, 5, 10));
    expect(text).toContain('1/5/2026');
    expect(text).toContain('2026-01-05');
    expect(searchText('2026-01-05')).toContain('1/5/2026');
    expect(searchText('01/05/2026')).toContain('2026-01-05');
  });

  it('gives the New York local day for UTC instants', () => {
    expect(searchText('2026-01-05T23:30:00Z').split('\n').slice(1)).toEqual(['1/5/2026', '2026-01-05']);
    expect(searchText('2026-01-06T03:00:00Z').split('\n').slice(1)).toEqual(['1/5/2026', '2026-01-05']);
  });

  it('is the plain text for everything else', () => {
    expect(searchText(42)).toBe('42');
    expect(searchText(null)).toBe('');
    expect(searchText('2026-02-30')).toBe('2026-02-30');
  });
});
