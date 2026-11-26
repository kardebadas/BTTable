import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterRows } from '../core/filters';
import { matchesSearch } from '../core/search';
import type { Column, FilterState, SortState } from '../core/types';
import { RowIndex } from './rowIndex';
import { compareValues } from '../core/compare';
import { getColumnValue } from '../core/values';
import { buildEntries, type RowEntry } from './rowModel';

/** Reference order for `RowIndex.sort`: a stable comparison sort on each row's sort value. */
function sortEntries<R>(entries: RowEntry<R>[], columns: readonly Column<R>[], sort: SortState): RowEntry<R>[] {
  const column = sort && columns.find((candidate) => candidate.key === sort.key);
  if (!sort || !column) return entries;
  const read = column.sortValue ?? ((row: R) => getColumnValue(column, row));
  const keyed = entries.map((entry) => ({ entry, key: read(entry.row) }));
  keyed.sort((a, b) => compareValues(a.key, b.key, sort.direction));
  return keyed.map((item) => item.entry);
}

type Row = { id: number; name: string; amount: unknown; when: unknown; tags: string[]; note?: unknown; hidden: string };

const NAMES = ['Ana Lopes', 'ÉLISE', 'bob', 'Zoë Ng', 'item 10', 'item 2', ''];
const AMOUNTS = [5, '7.5', null, -2, 0, 'n/a', 5];
const WHEN = [new Date(2026, 0, 2), '2025-06-30', '1/2/2026', null, 'soon', new Date('nope'), '2026-01-02T10:30'];

const ROWS: Row[] = Array.from({ length: 70 }, (_, i) => ({
  id: i,
  name: NAMES[i % NAMES.length],
  amount: AMOUNTS[(i * 3) % AMOUNTS.length],
  when: WHEN[(i * 5) % WHEN.length],
  tags: i % 3 === 0 ? ['red', 'blue'] : ['green'],
  note: i % 4 === 0 ? createElement('b', null, `note ${i}`) : undefined,
  hidden: 'secret',
}));

const COLUMNS: Column<Row>[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name', filter: { type: 'text', op: 'contains' } },
  { key: 'amount', header: 'Amount', filter: { type: 'number', op: 'range' } },
  { key: 'when', header: 'When', filter: { type: 'date', op: 'on' } },
  { key: 'tags', header: 'Tags', filter: { type: 'multiselect', options: [] } },
  { key: 'note', header: 'Note', filter: { type: 'notEmpty' } },
  { key: 'hidden', header: 'Hidden', searchable: false },
];

const entries = buildEntries(ROWS);
const ids = (list: { id: unknown }[]) => list.map((entry) => entry.id);

afterEach(() => vi.restoreAllMocks());

describe('RowIndex.search', () => {
  const index = new RowIndex(entries, COLUMNS);
  const TERMS = ['', ' ', 'lo', 'LOPES', 'élise', 'e', 'zoë', '1/2/2026', '2026-01-02', '6/30/2025', '7.5', 'yes', 'note 4', 'secret', 'item', 'item 1', 'x\u0000y', 'Ana Lopes', 'a'];

  it('keeps exactly the rows matchesSearch keeps, for each term in any order', () => {
    for (const term of [...TERMS, ...[...TERMS].reverse()]) {
      expect(ids(index.search(term))).toEqual(ids(entries.filter((entry) => matchesSearch(entry.row, COLUMNS, term))));
    }
  });

  it('reads each row value once per row list, not once per keystroke', () => {
    const searchValue = vi.fn((row: Row) => row.name);
    const spied = new RowIndex(entries, [{ key: 'name', header: 'Name', searchValue }]);
    for (const term of ['a', 'an', 'ana', 'b', 'bo', '']) spied.search(term);
    expect(searchValue).toHaveBeenCalledTimes(ROWS.length);
  });

  it('rechecks only the previous result when the term extends it', () => {
    const narrowing = new RowIndex(entries, COLUMNS);
    const first = narrowing.search('lo');
    const includes = vi.spyOn(String.prototype, 'includes');
    narrowing.search('lop');
    // One check per kept row, plus a couple on the term itself; a full pass would be one per row.
    expect(first.length).toBeLessThan(ROWS.length / 2);
    expect(includes.mock.calls.length).toBeLessThanOrEqual(first.length + 2);
  });

  it('returns the same list for the same term and the entries for a blank one', () => {
    expect(index.search(' Bob ')).toBe(index.search('bob'));
    expect(index.search('')).toBe(entries);
  });

  it('warms in slices and reports when every row has its text', () => {
    const warming = new RowIndex(buildEntries(Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `n${i}` }))), [{ key: 'name', header: 'N' }]);
    expect(warming.warmSearch(-1)).toBe(false);
    expect(warming.warmSearch(Infinity)).toBe(true);
  });
});

describe('RowIndex.filter', () => {
  const index = new RowIndex(entries, COLUMNS);
  const FILTERS: FilterState[] = [
    {},
    { name: ' LO ' },
    { amount: [0, 6] },
    { amount: [null, 0] },
    { when: '2026-01-02' },
    { tags: ['blue'] },
    { note: true },
    { name: 'e', amount: [null, 10], tags: ['green', 'red'] },
    { name: '   ' },
  ];

  it('keeps exactly the rows filterRows keeps', () => {
    for (const filters of FILTERS) {
      const expected = filterRows({ rows: ROWS, columns: COLUMNS, search: '', filters });
      expect(index.filter(entries, filters).map((entry) => entry.row)).toEqual(expected);
    }
  });

  it('returns the same list when no filter is active', () => {
    expect(index.filter(entries, { name: '' })).toBe(entries);
  });

  it('reads each filter column value once per row list, not once per filter pass', () => {
    const value = vi.fn((row: Row) => row.amount);
    const spied = new RowIndex(entries, [{ key: 'amount', header: 'A', value, filter: { type: 'number', op: 'gte' } }]);
    for (const amount of [0, 1, 5, -3]) spied.filter(entries, { amount });
    expect(value).toHaveBeenCalledTimes(ROWS.length);
  });
});

describe('RowIndex.sort', () => {
  const index = new RowIndex(entries, COLUMNS);
  const SORTS: SortState[] = ['id', 'name', 'amount', 'when', 'note', 'tags'].flatMap((key) => [
    { key, direction: 'asc' as const },
    { key, direction: 'desc' as const },
  ]);

  it('gives the order sortEntries gives, on all rows and on a filtered subset', () => {
    const subset = index.filter(entries, { tags: ['green'] });
    for (const sort of SORTS) {
      expect(ids(index.sort(entries, sort))).toEqual(ids(sortEntries(entries, COLUMNS, sort)));
      expect(ids(index.sort(subset, sort))).toEqual(ids(sortEntries(subset, COLUMNS, sort)));
    }
  });

  it('leaves the list as is without a sort or for an unknown column', () => {
    expect(index.sort(entries, null)).toBe(entries);
    expect(index.sort(entries, { key: 'nope', direction: 'asc' })).toBe(entries);
  });

  it('reads each sort value once per row list, reused by both directions and later sorts', () => {
    const sortValue = vi.fn((row: Row) => row.amount);
    const spied = new RowIndex(entries, [{ key: 'amount', header: 'A', sortValue }]);
    for (const direction of ['asc', 'desc', 'asc'] as const) spied.sort(entries, { key: 'amount', direction });
    expect(sortValue).toHaveBeenCalledTimes(ROWS.length);
  });

  it('handles an empty row list', () => {
    expect(new RowIndex([], COLUMNS).sort([], { key: 'id', direction: 'asc' })).toEqual([]);
  });
});
