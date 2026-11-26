import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server (where neither runs), so
 * server rendering never logs React 18's useLayoutEffect warning.
 */
export const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
