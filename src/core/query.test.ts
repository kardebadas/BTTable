import { describe, expect, it } from 'vitest';
import { buildQuery, typedFiltersKey } from './query';
import type { Column, FilterState } from './types';

type Row = Record<string, unknown>;

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', filter: { type: 'text', op: 'startsWith' } },
  { key: 'age', header: 'Age', filter: { type: 'number', op: 'gte' } },
  { key: 'score', header: 'Score', filter: { type: 'number', op: 'range' } },
  { key: 'born', header: 'Born', filter: { type: 'date' } },
  { key: 'seen', header: 'Seen', filter: { type: 'date', op: 'range' } },
  { key: 'state', header: 'State', filter: { type: 'select', options: [] } },
  { key: 'tags', header: 'Tags', filter: { type: 'multiselect', options: [] } },
  { key: 'email', header: 'Email', filter: { type: 'notEmpty' } },
  { key: 'plain', header: 'Plain' },
];

const BASE = { search: 'ana', sort: null, page: 2, pageSize: 25 };

describe('buildQuery', () => {
  it('sends page, page size, search and sort as they are', () => {
    const sort = { key: 'name', direction: 'desc' } as const;
    expect(buildQuery({ ...BASE, sort, filters: {} }, COLUMNS)).toEqual({ ...BASE, sort, filters: {} });
  });

  it('sends only active filters, with their type and operator', () => {
    const filters = { name: '  ', age: 'x', tags: [], email: false, state: 'ny', plain: 'ignored' };
    expect(buildQuery({ ...BASE, filters }, COLUMNS).filters).toEqual({ state: { type: 'select', value: 'ny' } });
  });

  it('sends typed values: numbers as numbers and dates as ISO days', () => {
    const filters: FilterState = {
      name: 'An',
      age: '30',
      score: ['1.5', null] as unknown as [number | null, number | null],
      born: '3/4/2020',
      seen: [null, '2021-12-31'] as const,
      tags: ['a', 'b'],
      email: true,
    };
    expect(buildQuery({ ...BASE, filters }, COLUMNS).filters).toEqual({
      name: { type: 'text', op: 'startsWith', value: 'An' },
      age: { type: 'number', op: 'gte', value: 30 },
      score: { type: 'number', op: 'range', value: [1.5, null] },
      born: { type: 'date', op: 'on', value: '2020-03-04' },
      seen: { type: 'date', op: 'range', value: [null, '2021-12-31'] },
      tags: { type: 'multiselect', value: ['a', 'b'] },
      email: { type: 'notEmpty', value: true },
    });
  });
});

describe('operators', () => {
  it('sends the default operator of text, number and date filters that set none', () => {
    const columns: Column<Row>[] = [
      { key: 'a', header: 'A', filter: { type: 'text' } },
      { key: 'b', header: 'B', filter: { type: 'number' } },
      { key: 'c', header: 'C', filter: { type: 'date' } },
    ];
    expect(buildQuery({ ...BASE, filters: { a: 'x', b: 2, c: '2024-01-31' } }, columns).filters).toEqual({
      a: { type: 'text', op: 'contains', value: 'x' },
      b: { type: 'number', op: 'eq', value: 2 },
      c: { type: 'date', op: 'on', value: '2024-01-31' },
    });
  });
});

describe('trimming', () => {
  it('trims the search and text filter values; whitespace only is empty', () => {
    const query = buildQuery({ ...BASE, search: '  ab ', filters: { name: ' An ' } }, COLUMNS);
    expect(query.search).toBe('ab');
    expect(query.filters).toEqual({ name: { type: 'text', op: 'startsWith', value: 'An' } });
    expect(buildQuery({ ...BASE, search: '   ', filters: { name: '  ' } }, COLUMNS)).toMatchObject({ search: '', filters: {} });
  });
});

describe('typedFiltersKey', () => {
  it('changes with text, number and date filters only', () => {
    const query = buildQuery({ ...BASE, filters: { name: 'a', state: 'ny' } }, COLUMNS);
    const typed = typedFiltersKey(query);
    expect(typedFiltersKey({ ...query, page: 9, filters: { ...query.filters, state: { type: 'select', value: 'tx' } } })).toBe(typed);
    expect(typedFiltersKey({ ...query, filters: { ...query.filters, name: { type: 'text', value: 'ab' } } })).not.toBe(typed);
  });
});
