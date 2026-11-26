import { describe, expect, it } from 'vitest';
import * as api from './index';

describe('package entry', () => {
  it('exports the package version', () => {
    expect(api.VERSION).toBe('0.1.0');
  });

  it('exports the pure helpers callers may need', () => {
    expect(typeof api.toCsv).toBe('function');
    expect(typeof api.buildExportData).toBe('function');
    expect(typeof api.parseDate).toBe('function');
    expect(typeof api.compareValues).toBe('function');
    expect(typeof api.formatValue).toBe('function');
  });

  it('exports the filter, search and query helpers that mirror the table logic', () => {
    const columns: api.Column<{ at: string }>[] = [{ key: 'at', header: 'At', filter: { type: 'datetime', op: 'after' } }];
    const rows = [{ at: '2026-01-05T09:00' }, { at: '2026-01-05T10:00' }];
    const filters = { at: '2026-01-05T09:30' };
    expect(api.filterRows({ rows, columns, search: '', filters })).toEqual([rows[1]]);
    expect(api.matchesFilter({ type: 'datetime' }, '2026-01-05T09:00:59', '2026-01-05T09:00')).toBe(true);
    expect(api.matchesSearch(rows[0], columns, '09:00')).toBe(true);
    expect(api.isFilterActive({ type: 'datetime' }, '')).toBe(false);
    const query = api.buildQuery({ search: ' x ', filters, sort: null, page: 1, pageSize: 10 }, columns);
    expect(query.filters).toEqual({ at: { type: 'datetime', op: 'after', value: '2026-01-05T09:30' } });
    const type: api.FilterType | null = api.normalizeFilterType(' Multi_Select ');
    expect(type).toBe('multiselect');
    expect(api.compareValues(1, 2)).toBeLessThan(0);
  });

  it('does not export calculateRowHeight', () => {
    expect('calculateRowHeight' in api).toBe(false);
  });

  it('exports BTTable as a ref-forwarding component and the handle types', () => {
    expect((api.BTTable as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.forward_ref'));
    const align: api.RowAlign = 'center';
    const tone: api.RowTone = 'info';
    expect([align, tone]).toEqual(['center', 'info']);
  });

  it('exports the default labels and the VirtualizeMode type', () => {
    expect(api.DEFAULT_LABELS.loading).toBe('Loading…');
    const mode: api.VirtualizeMode = 'auto';
    expect(mode).toBe('auto');
  });

  it('runs in jsdom with jest-dom matchers', () => {
    document.body.innerHTML = '<div class="btt">table</div>';
    expect(document.querySelector('.btt')).toBeInTheDocument();
  });
});
