import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRowLifecycle } from './useRowLifecycle';

describe('useRowLifecycle elements', () => {
  it('keeps the entry of a duplicate id that took it over when the earlier row unmounts', () => {
    const { result } = renderHook(() => useRowLifecycle({}));
    const first = document.createElement('tr');
    const second = document.createElement('tr');
    const untrackFirst = result.current.track(1, first);
    const untrackSecond = result.current.track(1, second);
    untrackFirst();
    expect(result.current.elements.get(1)).toBe(second);
    untrackSecond();
    expect(result.current.elements.has(1)).toBe(false);
  });
});
