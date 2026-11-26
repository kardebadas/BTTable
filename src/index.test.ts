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
