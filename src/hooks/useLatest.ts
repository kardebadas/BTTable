import { useEffect, useRef } from 'react';

/**
 * A ref that holds the latest rendered `value` (synced after each commit), so effects and
 * event handlers can read a fresh prop. Handlers may also write it to compose calls made
 * before the next render.
 */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
