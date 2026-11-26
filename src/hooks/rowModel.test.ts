import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEntries, indexOfId } from './rowModel';
import { useRowWarnings } from './useRowWarnings';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('indexOfId', () => {
  it('finds the first entry with the id, or -1', () => {
    const entries = buildEntries([{ id: 'a' }, { id: 'b' }, { id: 'a' }]);
    expect(indexOfId(entries, 'b')).toBe(1);
    expect(indexOfId(entries, 'a')).toBe(0);
    expect(indexOfId(entries, 'z')).toBe(-1);
  });

  it('builds the id map once per list', () => {
    const entries = buildEntries(Array.from({ length: 50 }, (_, id) => ({ id })));
    const set = vi.spyOn(Map.prototype, 'set');
    indexOfId(entries, 3);
    const built = set.mock.calls.length;
    indexOfId(entries, 40);
    indexOfId(entries, 7);
    expect(built).toBe(50);
    expect(set.mock.calls.length).toBe(built);
  });
});

describe('useRowWarnings', () => {
  const source = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, { name: i }]));
  const entries = buildEntries(source);
  const keysOfSource = (keys: { mock: { calls: unknown[][] } }) => keys.mock.calls.filter(([value]) => value === source).length;

  it('sizes a map source once per row list, not on every render', () => {
    const keys = vi.spyOn(Object, 'keys');
    const { rerender } = renderHook(() => useRowWarnings(source, entries));
    rerender();
    rerender();
    expect(keysOfSource(keys)).toBe(1);
  });

  it('does no row walks in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const keys = vi.spyOn(Object, 'keys');
    renderHook(() => useRowWarnings(source, entries));
    expect(keysOfSource(keys)).toBe(0);
  });
});
