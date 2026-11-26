import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/theme.css';
import '../src/styles/table.css';
import '../src/styles/controls.css';
import { COLUMNS, generateRows } from '../demo/data';
import '../demo/demo.css';
import { BTTable, type BTTableHandle, type RowId } from '../src';
import { rowOffsets } from '../src/core/virtual';
import { afterPaint, recordFrames, resizeCallbackMs, settle, stats, timeResizeObserver } from './probes';

const SIZES = [10_000, 100_000, 500_000, 1_000_000];
const requested = Number(new URLSearchParams(location.search).get('n'));
const n = SIZES.includes(requested) ? requested : SIZES[0];

performance.mark('gen-start');
const rows = generateRows(n, 42);
performance.mark('gen-end');

const scroller = () => document.querySelector<HTMLElement>('.btt-scroll');
const handle = createRef<BTTableHandle>();

/** Where row `id` is: mounted, and fully inside the scroll area below the sticky header. */
function rowState(id: RowId): { inDom: boolean; visible: boolean } {
  const row = handle.current?.getRowElement(id);
  const box = scroller()?.getBoundingClientRect();
  if (!row || !box) return { inDom: Boolean(row), visible: false };
  const head = scroller()?.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const rect = row.getBoundingClientRect();
  return { inDom: true, visible: rect.top >= box.top + head - 1 && rect.bottom <= box.bottom + 1 };
}

/** Scroll metrics of the table's scroll container. */
function scrollState() {
  const el = scroller();
  return { scrollTop: el?.scrollTop ?? 0, scrollHeight: el?.scrollHeight ?? 0, clientHeight: el?.clientHeight ?? 0 };
}

/** Text and checkbox of the first mounted data row: changes when sort, search or selection changes the view. */
function firstRowText(): string {
  const row = document.querySelector('.btt-scroll tr.btt-row');
  return `${row?.textContent ?? ''}|${String(row?.querySelector('input')?.checked)}`;
}

/**
 * One offsets pass as `useVirtualRows` does it on every height change (`offsetsOf`:
 * a height per entry from the cache or the estimate, then prefix sums), timed at this `n`.
 */
function offsetsPassMs(): number {
  const cache = new Map<RowId, number>(rows.slice(0, 40).map((row) => [row.id, 37]));
  const start = performance.now();
  rowOffsets(rows.map((row) => cache.get(row.id) ?? 40));
  return performance.now() - start;
}

/** Id of the last mounted data row (its ID cell, after the leading checkbox cell). */
function lastMountedId(): number | null {
  const rowsInDom = document.querySelectorAll<HTMLTableRowElement>('.btt-scroll tr.btt-row');
  const last = rowsInDom[rowsInDom.length - 1];
  if (!last) return null;
  return Number(last.cells[last.cells.length - COLUMNS.length]?.textContent);
}

let recorder: ReturnType<typeof recordFrames> | null = null;

/**
 * Arms a timer started by the next `eventType` event on the document (capture phase) and
 * stopped when the first data row's text changed and that frame painted; read it from
 * `bench.pending` (ms, or null on timeout).
 */
function timeChange(eventType: string, timeoutMs: number): void {
  const before = firstRowText();
  bench.pending = new Promise((resolve) => {
    const onEvent = () => {
      const start = performance.now();
      void afterPaint(() => firstRowText() !== before, timeoutMs).then((end) => resolve(end === null ? null : end - start));
    };
    document.addEventListener(eventType, onEvent, { capture: true, once: true });
  });
}

const bench = {
  n,
  lastId: rows[rows.length - 1]?.id as RowId,
  handle,
  afterPaint,
  recordFrames,
  rowState,
  scrollState,
  firstRowText,
  offsetsPassMs,
  resizeStats: (from = 0) => stats(resizeCallbackMs.slice(from)),
  resizeCount: () => resizeCallbackMs.length,
  lastMountedId,
  startFrames: () => {
    recorder = recordFrames();
  },
  stopFrames: () => recorder?.stop() ?? null,
  timeChange,
  /** Waits for the scroll position and height to hold still. */
  settle: (maxMs?: number) => settle(() => `${scrollState().scrollTop}:${scrollState().scrollHeight}`, maxMs),
  pending: null as Promise<number | null> | null,
  firstRows: null as Promise<number | null> | null,
};
declare global {
  interface Window {
    __bench: typeof bench;
  }
}
window.__bench = bench;

timeResizeObserver();
performance.mark('mount-start');
bench.firstRows = afterPaint(() => document.querySelector('.btt-scroll tr.btt-row') !== null, 600_000);
createRoot(document.getElementById('root') as HTMLElement).render(
  <main className="demo">
    <BTTable
      ref={handle}
      columns={COLUMNS}
      rows={rows}
      pagination={false}
      selectable
      searchDebounceMs={0}
      caption="Bench rows"
      maxHeight={600}
    />
  </main>,
);
