import { describe, expect, it } from 'vitest';
import { getCounter, pageCount, paginate } from './pagination';

const rows = Array.from({ length: 300 }, (_, i) => i);

describe('pageCount', () => {
  it('has no empty extra page after a full last page (#9)', () => {
    expect(pageCount(100, 50)).toBe(2);
    expect(pageCount(101, 50)).toBe(3);
  });

  it('is at least one page', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(10, 0)).toBe(1);
    expect(pageCount(10, Number.NaN)).toBe(1);
    expect(pageCount(Number.NaN, 50)).toBe(1);
    expect(pageCount(undefined as unknown as number, 50)).toBe(1);
    expect(pageCount(Infinity, 50)).toBe(1);
  });
});

describe('paginate', () => {
  it('slices page 2 of 50 arithmetically, never by string concatenation (#8)', () => {
    const page = paginate(rows, 2, 50);
    expect(page).toHaveLength(50);
    expect(page[0]).toBe(50);
    expect(page[49]).toBe(99);
    const fromString = paginate(rows, '2' as unknown as number, '50' as unknown as number);
    expect(fromString).toEqual(page);
  });

  it('clamps the page into range', () => {
    expect(paginate(rows, 99, 100)[0]).toBe(200);
    expect(paginate(rows, 0, 100)[0]).toBe(0);
    expect(paginate([], 3, 100)).toEqual([]);
  });

  it('returns every row when the page size is not positive', () => {
    expect(paginate(rows, 1, 0)).toHaveLength(300);
  });
});

describe('getCounter', () => {
  it('returns null for "No records", never "1 to 0" (#14)', () => {
    expect(getCounter({ page: 1, pageSize: 100, total: 0 })).toBeNull();
  });

  it('reports the visible range and total', () => {
    expect(getCounter({ page: 1, pageSize: 100, total: 2345 })).toEqual({ from: 1, to: 100, total: 2345 });
    expect(getCounter({ page: 24, pageSize: 100, total: 2345 })).toEqual({ from: 2301, to: 2345, total: 2345 });
  });

  it('clamps an out-of-range page', () => {
    expect(getCounter({ page: 9, pageSize: 100, total: 150 })).toEqual({ from: 101, to: 150, total: 150 });
  });

  it('adds the unfiltered total only when it differs', () => {
    const counter = getCounter({ page: 2, pageSize: 100, total: 1234, unfilteredTotal: 50000 });
    expect(counter).toEqual({ from: 101, to: 200, total: 1234, filteredFrom: 50000 });
    expect(getCounter({ page: 1, pageSize: 100, total: 5, unfilteredTotal: 5 })).toEqual({ from: 1, to: 5, total: 5 });
  });

  it('counts from the rows when the total is missing or invalid (#14)', () => {
    const counter = getCounter({ page: 2, pageSize: 10, total: -1, unfilteredTotal: -1, pageRowCount: 4 });
    expect(counter).toEqual({ from: 11, to: 14, total: 14 });
    expect(getCounter({ page: 1, pageSize: 10, total: Number.NaN })).toBeNull();
  });

  it('shows everything as one page when the page size is not positive', () => {
    expect(getCounter({ page: 3, pageSize: 0, total: 40 })).toEqual({ from: 1, to: 40, total: 40 });
  });
});
