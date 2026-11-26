/** Markdown tables of a bench run. */
import type { RunResult } from './run.ts';

type Value = Record<string, unknown>;

const num = (value: unknown, digits = 0) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—');

/** The step's value, or its error as the cell text. */
function cell(run: RunResult, step: string, render: (value: Value) => string): string {
  const result = run.steps[step];
  if (!result) return '—';
  if (result.error) return result.error.startsWith('timeout') ? 'timeout' : result.error.slice(0, 24);
  return render((result.value ?? {}) as Value);
}

const frames = (value: Value) => {
  const stats = value.frames as Value | undefined;
  return stats ? `${num(stats.p50, 1)} / ${num(stats.p95, 1)} / ${num(stats.max)}` : '—';
};

/** ✓ visible, "in DOM" when mounted but off screen, else ✗ with the last mounted row id. */
const lastRow = (value: Value) => {
  if (value.visible) return '✓';
  if (value.inDom) return 'in DOM';
  return `✗ (last ${num(value.lastMountedId)})`;
};

const dragCell = (value: Value) => {
  if (value.skipped) return String(value.skipped);
  return value.dragMoved ? lastRow(value) : 'thumb missed';
};

const COLUMNS_A: [string, (run: RunResult) => string][] = [
  ['browser', (run) => `${run.browser} ${run.version.split('.')[0]}`],
  ['n', (run) => run.n.toLocaleString('en-US')],
  ['gen ms', (run) => cell(run, 'load', (v) => num(v.genMs))],
  ['first rows ms', (run) => cell(run, 'load', (v) => num(v.firstRowsMs))],
  ['heap MB', (run) => cell(run, 'heap', (v) => (v.skipped ? 'n/a' : num(v.jsHeapMB)))],
  ['wheel p50/p95/max ms', (run) => cell(run, 'wheel', frames)],
  ['drag p50/p95/max ms', (run) => cell(run, 'drag', (v) => (v.skipped ? 'n/a' : frames(v)))],
  ['header drift px', (run) => cell(run, 'wheel', (v) => num(v.headerDriftPx, 1)) + ' / ' + cell(run, 'drag', (v) => (v.skipped ? 'n/a' : num(v.headerDriftPx, 1)))],
  ['RO cb p95/max ms', (run) => cell(run, 'wheel', (v) => `${num((v.resize as Value).p95, 1)} / ${num((v.resize as Value).max, 1)}`)],
  ['offsets pass ms', (run) => cell(run, 'offsetsPass', (v) => num(v.medianMs, 1))],
];

const COLUMNS_B: [string, (run: RunResult) => string][] = [
  ['browser', COLUMNS_A[0][1]],
  ['n', COLUMNS_A[1][1]],
  ['max scrollHeight px', (run) => cell(run, 'scrollTopMax', (v) => num(v.scrollHeight))],
  ['last row: drag', (run) => cell(run, 'drag', dragCell)],
  ['End key', (run) => cell(run, 'endKey', lastRow)],
  ['scrollTop=max', (run) => cell(run, 'scrollTopMax', lastRow)],
  ['scrollToRow', (run) => cell(run, 'scrollToRow', lastRow)],
  ['search ms', (run) => cell(run, 'search', (v) => num(v.queryMs))],
  ['clear ms', (run) => cell(run, 'search', (v) => num(v.clearMs))],
  ['sort asc/desc ms', (run) => cell(run, 'sort', (v) => `${num(v.ascMs)} / ${num(v.descMs)}`)],
  ['select all / none ms', (run) => cell(run, 'selectAll', (v) => `${num(v.selectMs)} / ${num(v.clearMs)}`)],
];

function table(runs: RunResult[], columns: [string, (run: RunResult) => string][]): string {
  const head = `| ${columns.map(([name]) => name).join(' | ')} |`;
  const rule = `|${columns.map(() => '---').join('|')}|`;
  const rows = runs.map((run) => `| ${columns.map(([, render]) => render(run)).join(' | ')} |`);
  return [head, rule, ...rows].join('\n');
}

export function markdown(runs: RunResult[]): string {
  return `${table(runs, COLUMNS_A)}\n\n${table(runs, COLUMNS_B)}\n`;
}
