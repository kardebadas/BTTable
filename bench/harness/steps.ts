/**
 * One measurement per function, each driving the bench page (`bench/main.tsx`) through
 * `window.__bench`. Every step leaves the page settled; the runner applies the timeouts.
 */
import type { CDPSession, Page } from 'playwright-core';

export type StepContext = { page: Page; cdp: CDPSession | null; timeoutMs: number };

/** The scroll container's box and its vertical scrollbar width (0: overlay or no scrollbar). */
type Box = { x: number; y: number; width: number; height: number; bar: number };

async function scrollBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.btt-scroll');
    if (!el) return { x: 0, y: 0, width: 0, height: 0, bar: 0 };
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height, bar: el.offsetWidth - el.clientWidth - 2 * el.clientLeft };
  });
}

async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const el = document.querySelector('.btt-scroll');
    if (el) el.scrollTop = 0;
    await window.__bench.settle();
  });
}

/** Where the last row is after a scroll: mounted, visible, and the scroll metrics. */
async function reach(page: Page) {
  return page.evaluate(() => {
    const bench = window.__bench;
    return { ...bench.rowState(bench.lastId), ...bench.scrollState(), lastMountedId: bench.lastMountedId() };
  });
}

/** Generation time, mount → first data rows painted, and navigation → painted. */
export async function load({ page }: StepContext) {
  await page.waitForFunction(() => window.__bench?.firstRows != null, undefined, { timeout: 0, polling: 100 });
  return page.evaluate(async () => {
    const painted = await window.__bench.firstRows;
    const gen = performance.measure('gen', 'gen-start', 'gen-end').duration;
    const mountStart = performance.getEntriesByName('mount-start')[0]?.startTime ?? 0;
    return { genMs: gen, firstRowsMs: painted === null ? null : painted - mountStart, navToRowsMs: painted };
  });
}

/** JS heap after a forced GC (Chrome only, through CDP). */
export async function heap({ cdp }: StepContext) {
  if (!cdp) return { skipped: 'no CDP' };
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  return { jsHeapMB: Math.round(used / 2 ** 20) };
}

/** The `offsetsOf` pass replicated at this n: one entries map + prefix sums. */
export async function offsetsPass({ page }: StepContext) {
  return page.evaluate(() => {
    const median = (time: () => number) => [0, 1, 2, 3, 4].map(time).sort((a, b) => a - b)[2];
    return { medianMs: median(window.__bench.offsetsPassMs), buildMs: median(window.__bench.treeBuildMs) };
  });
}

/** Fast wheel scrolling for ~3 s: frame times, header drift, ResizeObserver callback cost. */
export async function wheel({ page }: StepContext) {
  await scrollToTop(page);
  const box = await scrollBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await page.evaluate(() => window.__bench.resizeCount());
  await page.evaluate(() => window.__bench.startFrames());
  const end = Date.now() + 3_000;
  let events = 0;
  while (Date.now() < end) {
    await page.mouse.wheel(0, 1_500);
    events += 1;
  }
  await page.evaluate(() => window.__bench.settle());
  const result = await page.evaluate((from) => ({ ...window.__bench.stopFrames(), resize: window.__bench.resizeStats(from) }), before);
  return { ...result, wheelEvents: events, ...(await reach(page)) };
}

/**
 * Drags the scrollbar thumb from the top to the bottom in 60 steps. The thumb starts just
 * below the arrow button (about one scrollbar width tall); headless Firefox draws no scrollbar.
 */
export async function drag({ page }: StepContext) {
  await scrollToTop(page);
  const box = await scrollBox(page);
  if (box.bar < 5) return { skipped: 'no scrollbar' };
  const x = box.x + box.width - 1 - box.bar / 2;
  const top = box.y + box.bar + 12;
  const bottom = box.y + box.height - box.bar - 2;
  await page.mouse.move(x, top);
  await page.evaluate(() => window.__bench.startFrames());
  await page.mouse.down();
  for (let step = 1; step <= 60; step += 1) {
    await page.mouse.move(x, top + ((bottom - top) * step) / 60);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.evaluate(() => window.__bench.settle());
  const result = await page.evaluate(() => window.__bench.stopFrames());
  const where = await reach(page);
  return { ...result, dragMoved: where.scrollTop > 0, ...where };
}

/** End key on the scroll container (after a click on a cell gives it keyboard scrolling). */
export async function endKey({ page }: StepContext) {
  await scrollToTop(page);
  await page.locator('.btt-scroll tr.btt-row td').nth(2).click();
  await page.keyboard.press('End');
  await page.evaluate(() => window.__bench.settle(5_000));
  return reach(page);
}

/** `scrollTop = scrollHeight` once, then settled. */
export async function scrollTopMax({ page }: StepContext) {
  await scrollToTop(page);
  await page.evaluate(async () => {
    const el = document.querySelector('.btt-scroll');
    if (el) el.scrollTop = el.scrollHeight;
    await window.__bench.settle(5_000);
  });
  return reach(page);
}

/** `handle.scrollToRow(lastId)`, then waits up to 5 s for the row to be visible. */
export async function scrollToRow({ page }: StepContext) {
  await scrollToTop(page);
  const accepted = await page.evaluate(async () => {
    const bench = window.__bench;
    const start = performance.now();
    const ok = bench.handle.current?.scrollToRow(bench.lastId) ?? false;
    const shown = await bench.afterPaint(() => bench.rowState(bench.lastId).visible, 5_000);
    await bench.settle();
    return { accepted: ok, msToVisible: shown === null ? null : shown - start };
  });
  return { ...accepted, ...(await reach(page)) };
}

/** Arms the in-page change timer, runs `act`, and returns ms from the event to the changed frame. */
async function timed(page: Page, eventType: string, act: () => Promise<void>, timeoutMs: number) {
  await page.evaluate(({ type, ms }) => window.__bench.timeChange(type, ms), { type: eventType, ms: timeoutMs });
  await act();
  const ms = await page.evaluate(() => window.__bench.pending);
  await page.evaluate(() => window.__bench.settle());
  return ms;
}

/** Clicks the Amount sort button: asc, desc, then back to unsorted (untimed). */
export async function sort({ page, timeoutMs }: StepContext) {
  await scrollToTop(page);
  const button = page.locator('.btt-scroll thead th', { hasText: 'Amount' }).locator('button.btt-sort');
  const ascMs = await timed(page, 'click', () => button.click(), timeoutMs);
  const descMs = await timed(page, 'click', () => button.click(), timeoutMs);
  await button.click({ timeout: timeoutMs });
  await page.evaluate((ms) => window.__bench.settle(ms), timeoutMs);
  return { ascMs, descMs };
}

/** Selects the search box text and deletes it with Backspace; ms to the changed frame. */
async function clearSearch(page: Page, timeoutMs: number) {
  await page.keyboard.press('Control+A');
  return timed(page, 'input', () => page.keyboard.press('Backspace'), timeoutMs);
}

/**
 * Clicks the search box and at once pastes a filtering term as one input event (the first
 * search: focus starts the warm-up, the query finishes it), clears it with Backspace, then
 * pastes `lope`, which does not extend `lopes`, so it scans every prebuilt text (a later search).
 */
export async function search({ page, timeoutMs }: StepContext) {
  await scrollToTop(page);
  await page.locator('.btt-search-input').click();
  const queryMs = await timed(page, 'input', () => page.keyboard.insertText('lopes'), timeoutMs);
  const matches = await page.evaluate(() => document.querySelector('.btt-scroll table')?.getAttribute('aria-rowcount'));
  const clearMs = await clearSearch(page, timeoutMs);
  const laterMs = await timed(page, 'input', () => page.keyboard.insertText('lope'), timeoutMs);
  await clearSearch(page, timeoutMs);
  return { term: 'lopes', queryMs, matchedRows: Number(matches) - 1, clearMs, laterMs };
}

/** Reloads the page, focuses the search box, waits `FOCUS_WAIT_MS` (a user about to type), then runs `search`. */
export async function searchAfterFocus(ctx: StepContext) {
  await ctx.page.reload({ waitUntil: 'commit' });
  await load(ctx);
  await ctx.page.locator('.btt-search-input').focus();
  await ctx.page.waitForTimeout(FOCUS_WAIT_MS);
  return { waitMs: FOCUS_WAIT_MS, ...(await search(ctx)) };
}

/** Focus → first keystroke delay assumed by `searchAfterFocus`. */
const FOCUS_WAIT_MS = 2_000;

/** Clicks the select-all box (every filtered row), then again to clear. */
export async function selectAll({ page, timeoutMs }: StepContext) {
  await scrollToTop(page);
  const box = page.locator('.btt-scroll thead input[type="checkbox"]');
  const selectMs = await timed(page, 'click', () => box.click(), timeoutMs);
  const clearMs = await timed(page, 'click', () => box.click(), timeoutMs);
  return { selectMs, clearMs };
}
