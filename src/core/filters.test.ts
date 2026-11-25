import { describe, expect, it, vi } from 'vitest';
import { filterRows, isFilterActive, matchesFilter } from './filters';
import type { Column, FilterSpec, FilterValue } from './types';

const text = (op?: 'contains' | 'equals' | 'startsWith' | 'endsWith'): FilterSpec => ({ type: 'text', op });
const num = (op?: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'range'): FilterSpec => ({ type: 'number', op });
const date = (op?: 'on' | 'before' | 'after' | 'range'): FilterSpec => ({ type: 'date', op });
const options = [
  { value: '0', label: 'Zero' },
  { value: 'false', label: 'False' },
  { value: 'a', label: 'A' },
];
const select: FilterSpec = { type: 'select', options };
const multi: FilterSpec = { type: 'multiselect', options };
const notEmpty: FilterSpec = { type: 'notEmpty' };

function matches(spec: FilterSpec, rowValues: unknown[], value: FilterValue): unknown[] {
  return rowValues.filter((rowValue) => matchesFilter(spec, rowValue, value));
}

describe('isFilterActive', () => {
  it('treats empty values as inactive and 0 / false-like values as active (#17)', () => {
    const cases: [FilterSpec, FilterValue, boolean][] = [
      [text(), '', false],
      [text(), '   ', false],
      [text(), undefined, false],
      [text(), '0', true],
      [num(), null, false],
      [num(), '', false],
      [num(), 'abc', false],
      [num(), 0, true],
      [num(), '0', true],
      [num('range'), [null, null], false],
      [num('range'), [0, null], true],
      [num('range'), 5, false],
      [date(), '', false],
      [date(), '2026-02-30', false],
      [date(), '2026-01-05', true],
      [date('range'), [null, ''], false],
      [date('range'), [null, '2026-01-05'], true],
      [select, '', false],
      [select, '0', true],
      [multi, [], false],
      [multi, ['0'], true],
      [multi, 'a', false],
      [notEmpty, false, false],
      [notEmpty, true, true],
    ];
    for (const [spec, value, active] of cases) {
      expect(isFilterActive(spec, value), `${spec.type} ${JSON.stringify(value)}`).toBe(active);
    }
  });
});

describe('matchesFilter', () => {
  it('lets every row through an inactive filter, including 0, false, "" and null (#17, #18)', () => {
    const rows = [0, false, '', null, undefined, 'x'];
    expect(matches(multi, rows, [])).toEqual(rows);
    expect(matches(text(), rows, '')).toEqual(rows);
    expect(matches(num(), rows, null)).toEqual(rows);
  });

  it('matches text case-insensitively and trimmed for every op', () => {
    const rows = ['  Alpha Beta ', 'beta', 'ALPHA', null, 0];
    expect(matches(text(), rows, ' BETA ')).toEqual(['  Alpha Beta ', 'beta']);
    expect(matches(text('contains'), rows, 'ph')).toEqual(['  Alpha Beta ', 'ALPHA']);
    expect(matches(text('equals'), rows, 'alpha')).toEqual(['ALPHA']);
    expect(matches(text('startsWith'), rows, 'alpha')).toEqual(['  Alpha Beta ', 'ALPHA']);
    expect(matches(text('endsWith'), rows, 'BETA')).toEqual(['  Alpha Beta ', 'beta']);
    expect(matches(text('equals'), rows, '0')).toEqual([0]);
  });

  it('implements every numeric op numerically (#16)', () => {
    const rows = [9, '10', 0, -3, null, 'abc', 10];
    expect(matches(num(), rows, 10)).toEqual(['10', 10]);
    expect(matches(num('eq'), rows, 0)).toEqual([0]);
    expect(matches(num('gt'), rows, 9)).toEqual(['10', 10]);
    expect(matches(num('gte'), rows, '9')).toEqual([9, '10', 10]);
    expect(matches(num('lt'), rows, 0)).toEqual([-3]);
    expect(matches(num('lte'), rows, 0)).toEqual([0, -3]);
    expect(matches(num('range'), rows, [0, 9])).toEqual([9, 0]);
    expect(matches(num('range'), rows, [null, 0])).toEqual([0, -3]);
    expect(matches(num('range'), rows, [10, null])).toEqual(['10', 10]);
  });

  it('matches a Date row against an ISO day without throwing (#19)', () => {
    const rows = [new Date(2026, 0, 5, 23, 59), new Date(2026, 0, 6), '2026-01-05T08:00', '1/5/2026'];
    expect(matches(date(), rows, '2026-01-05')).toEqual([rows[0], '2026-01-05T08:00', '1/5/2026']);
    expect(matches(date('on'), rows, '1/6/2026')).toEqual([rows[1]]);
  });

  it('uses the local (New York) calendar day for UTC instants', () => {
    const rows = ['2026-01-05T23:30:00Z', '2026-01-06T03:00:00Z', '2026-01-06T05:00:00Z'];
    expect(matches(date('on'), rows, '2026-01-05')).toEqual(['2026-01-05T23:30:00Z', '2026-01-06T03:00:00Z']);
  });

  it('agrees with sorting on numeric strings', () => {
    expect(matches(num('gt'), ['1.5', '1.25', '-5', '-10'], '1.3')).toEqual(['1.5']);
    expect(matches(num('lt'), ['1.5', '1.25', '-5', '-10'], -6)).toEqual(['-10']);
  });

  it('compares dates as calendar days for before / after / range (#20)', () => {
    const rows = ['1/4/2026', '2026-01-05T23:00', new Date(2026, 0, 6), '2026-02-30', 'soon', null];
    expect(matches(date('before'), rows, '2026-01-05')).toEqual(['1/4/2026']);
    expect(matches(date('after'), rows, '2026-01-05')).toEqual([rows[2]]);
    expect(matches(date('range'), rows, ['2026-01-04', '2026-01-05'])).toEqual(['1/4/2026', '2026-01-05T23:00']);
    expect(matches(date('range'), rows, [null, '2026-01-04'])).toEqual(['1/4/2026']);
    expect(matches(date('range'), rows, ['2026-01-06', null])).toEqual([rows[2]]);
  });

  it('matches select by exact option value, falsy row values included (#17)', () => {
    const rows = [0, false, 'a', 'A', null, ['x', 'a']];
    expect(matches(select, rows, '0')).toEqual([0]);
    expect(matches(select, rows, 'false')).toEqual([false]);
    expect(matches(select, rows, 'a')).toEqual(['a', ['x', 'a']]);
  });

  it('matches multiselect by membership (#18)', () => {
    const rows = [0, false, 'a', null, ['a', 'b'], ['b']];
    expect(matches(multi, rows, ['0', 'a'])).toEqual([0, 'a', ['a', 'b']]);
    expect(matches(multi, rows, ['false'])).toEqual([false]);
  });

  it('keeps non-empty values, where 0 and false count as values (#17)', () => {
    const rows = [0, false, '', '  ', null, undefined, [], ['x'], 'x'];
    expect(matches(notEmpty, rows, true)).toEqual([0, false, ['x'], 'x']);
  });
});

type Row = { id: number; name: string; qty: number };

describe('filterRows', () => {
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', filter: { type: 'text' } },
    { key: 'qty', header: 'Qty', filter: { type: 'number', op: 'gte' } },
  ];
  const rows: Row[] = [
    { id: 1, name: 'Apple', qty: 0 },
    { id: 2, name: 'Apricot', qty: 5 },
    { id: 3, name: 'Banana', qty: 7 },
  ];

  it('ANDs search with every active filter and keeps input order', () => {
    expect(filterRows({ rows, columns, search: '', filters: {} })).toEqual(rows);
    expect(filterRows({ rows, columns, search: 'ap', filters: { qty: 1 } })).toEqual([rows[1]]);
    expect(filterRows({ rows, columns, search: '', filters: { qty: 0, name: '' } })).toEqual(rows);
    expect(filterRows({ rows, columns, search: 'zzz', filters: {} })).toEqual([]);
  });

  it('ignores filter values for columns without a filter', () => {
    const plain: Column<Row>[] = [{ key: 'name', header: 'Name' }];
    expect(filterRows({ rows, columns: plain, search: '', filters: { name: 'x' } })).toEqual(rows);
  });

  it('is one linear pass and keeps repeated row objects (#41)', () => {
    const value = vi.fn((row: Row) => row.qty);
    const counted: Column<Row>[] = [{ key: 'qty', header: 'Qty', value, searchable: false, filter: { type: 'number', op: 'gt' } }];
    const many = Array.from({ length: 20000 }, (_, i) => rows[i % 3]);
    const result = filterRows({ rows: many, columns: counted, search: '', filters: { qty: 4 } });
    expect(result).toHaveLength(13333);
    expect(result[0]).toBe(rows[1]);
    expect(value).toHaveBeenCalledTimes(many.length);
  });
});
