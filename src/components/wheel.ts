import type { WheelEvent } from 'react';

/**
 * `onWheel` of number inputs: blurs the input (a no-op unless it has focus), so a wheel
 * turn scrolls the page instead of stepping the value. It never calls `preventDefault`,
 * so it works on React's passive wheel listener and never blocks scrolling.
 */
export function blurOnWheel(event: WheelEvent<HTMLInputElement>): void {
  event.currentTarget.blur();
}
