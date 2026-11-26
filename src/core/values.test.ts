import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { Column } from './types';
import { formatValue, getColumnValue, ownRowId, toNumber } from './values';

type Row = Record<string, unknown>;

describe('ownRowId', () => {
  it('prefers id, then ID, INDEX, N_ID', () => {
    expect(ownRowId({ id: 'a', ID: 'b' })).toBe('a');
    expect(ownRowId({ ID: 7, INDEX: 8 })).toBe(7);
    expect(ownRowId({ INDEX: 0, N_ID: 9 })).toBe(0);
    expect(ownRowId({ N_ID: 'n' })).toBe('n');
  });

  it('is undefined when no usable id exists', () => {
    expect(ownRowId({ name: 'x' })).toBeUndefined();
    expect(ownRowId({ id: null, ID: { nested: 1 } })).toBeUndefined();
    expect(ownRowId(null)).toBeUndefined();
    expect(ownRowId('text')).toBeUndefined();
  });
});

describe('getColumnValue', () => {
  it('reads row[key] by default', () => {
    expect(getColumnValue<Row>({ key: 'age', header: 'Age' }, { age: 0 })).toBe(0);
  });

  it('uses the column accessor when given', () => {
    const column: Column<Row> = { key: 'x', header: 'X', value: (row) => `${row.a}-${row.b}` };
    expect(getColumnValue(column, { a: 1, b: 2 })).toBe('1-2');
  });

  it('returns undefined for a row that is not an object', () => {
    expect(getColumnValue<unknown>({ key: 'x', header: 'X' }, null)).toBeUndefined();
  });
});

describe('toNumber', () => {
  it('reads plain decimal strings', () => {
    expect(toNumber('-0.5')).toBe(-0.5);
    expect(toNumber('+3')).toBe(3);
    expect(toNumber('.5')).toBe(0.5);
    expect(toNumber('10.')).toBe(10);
    expect(toNumber(' 42 ')).toBe(42);
  });

  it('keeps exponents, hex, Infinity, blanks and grouped digits as text', () => {
    for (const text of ['1e1', '0x10', 'Infinity', '', '  ', '1,000', '.', '-']) {
      expect(toNumber(text), text).toBeNull();
    }
  });

  it('passes finite numbers through and rejects everything else', () => {
    expect(toNumber(7)).toBe(7);
    expect(toNumber(Infinity)).toBeNull();
    expect(toNumber(true)).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('formatValue', () => {
  it('formats primitives', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(undefined)).toBe('');
    expect(formatValue('abc')).toBe('abc');
    expect(formatValue(0)).toBe('0');
    expect(formatValue(-1.5)).toBe('-1.5');
    expect(formatValue(Number.NaN)).toBe('');
    expect(formatValue(BigInt(10))).toBe('10');
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
  });

  it('formats dates as M/D/YYYY and invalid dates as empty', () => {
    expect(formatValue(new Date(2026, 0, 5, 10))).toBe('1/5/2026');
    expect(formatValue(new Date('nope'))).toBe('');
  });

  it('joins arrays, skipping empty entries', () => {
    expect(formatValue(['a', 1, null, false])).toBe('a, 1, No');
  });

  it('extracts the text of React elements', () => {
    const element = createElement('span', null, 'Hello ', createElement('b', null, 'World'), 3, null, false);
    expect(formatValue(element)).toBe('Hello World3');
    expect(formatValue(createElement('br'))).toBe('');
  });

  it('formats other objects as empty', () => {
    expect(formatValue({ a: 1 })).toBe('');
    expect(formatValue(() => 1)).toBe('');
  });
});
