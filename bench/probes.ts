/**
 * In-page probes the harness calls through `window.__bench`: paint waits, rAF frame
 * timing, header drift sampling and ResizeObserver callback timing.
 */

/** p50 / p95 / max of a list of durations in ms. */
export type Stats = { count: number; p50: number; p95: number; max: number; total: number };

export function stats(values: readonly number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0, total };
}

const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/**
 * Resolves with `performance.now()` one frame after `ready()` first holds in a rAF
 * callback (that frame has painted by then), or null after `timeoutMs`.
 */
export async function afterPaint(ready: () => boolean, timeoutMs = 60_000): Promise<number | null> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    await frame();
    if (!ready()) continue;
    await frame();
    return performance.now();
  }
  return null;
}

/** Left and width of every header cell, in viewport px. */
function headerBoxes(): number[] {
  return Array.from(document.querySelectorAll('.btt-scroll thead th')).flatMap((th) => {
    const rect = th.getBoundingClientRect();
    return [rect.left, rect.width];
  });
}

/** Max distance between two header samples. */
function drift(first: readonly number[], next: readonly number[]): number {
  if (first.length !== next.length) return Infinity;
  return next.reduce((max, value, i) => Math.max(max, Math.abs(value - first[i])), 0);
}

/** A running rAF recorder: frame deltas plus header drift from the first sample. */
export function recordFrames(): { stop: () => { frames: Stats; headerDriftPx: number } } {
  const deltas: number[] = [];
  const first = headerBoxes();
  let maxDrift = 0;
  let last = performance.now();
  let running = true;
  const tick = (now: number) => {
    if (!running) return;
    deltas.push(now - last);
    last = now;
    maxDrift = Math.max(maxDrift, drift(first, headerBoxes()));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    stop: () => {
      running = false;
      return { frames: stats(deltas.slice(1)), headerDriftPx: maxDrift };
    },
  };
}

/** Durations of every ResizeObserver callback the page ran, in ms. */
export const resizeCallbackMs: number[] = [];

/**
 * Replaces `ResizeObserver` with a subclass that times each callback, before the table
 * mounts: this is how the bench sees the library's measurement batches without touching it.
 */
export function timeResizeObserver(): void {
  const Native = window.ResizeObserver;
  class TimedResizeObserver extends Native {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        const start = performance.now();
        callback(entries, observer);
        resizeCallbackMs.push(performance.now() - start);
      });
    }
  }
  window.ResizeObserver = TimedResizeObserver;
}

/** Waits until `read()` holds still for 5 frames (smooth scrolls, re-measurements), at most `maxMs`. */
export async function settle(read: () => string, maxMs = 3_000): Promise<void> {
  const deadline = performance.now() + maxMs;
  let last = read();
  let stable = 0;
  while (stable < 5 && performance.now() < deadline) {
    await frame();
    const now = read();
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}
