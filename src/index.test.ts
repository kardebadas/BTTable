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
    expect(typeof api.BTTable).toBe('function');
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
