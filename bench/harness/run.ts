/**
 * `npm run bench -- [--label before] [--n 10000,100000] [--browsers chrome,firefox] [--timeout 120]`
 *
 * Builds `bench/` and serves it with its own `vite preview` on port 5299, runs every step for each browser
 * and row count, writes `bench/results/<label>.json` and prints markdown tables.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { type Browser, chromium, firefox } from 'playwright-core';
import { profiled } from './profile.ts';
import { markdown } from './report.ts';
import * as steps from './steps.ts';
import type { StepContext } from './steps.ts';

const PORT = 5299;
const CHROME = '/usr/bin/google-chrome';

type Step = (ctx: StepContext) => Promise<unknown>;
type StepResult = { ms: number; value?: unknown; error?: string };
export type RunResult = { browser: string; version: string; n: number; steps: Record<string, StepResult> };

const STEPS: [string, Step][] = [
  ['load', steps.load],
  ['heap', steps.heap],
  ['offsetsPass', steps.offsetsPass],
  ['wheel', steps.wheel],
  ['drag', steps.drag],
  ['endKey', steps.endKey],
  ['scrollTopMax', steps.scrollTopMax],
  ['scrollToRow', steps.scrollToRow],
  ['sort', steps.sort],
  ['search', steps.search],
  ['selectAll', steps.selectAll],
  ['profileWheel', (ctx) => (ctx.cdp ? profiled(ctx.cdp, () => steps.wheel(ctx)).then((p) => p.top) : Promise.resolve(null))],
  ['profileSearch', (ctx) => (ctx.cdp ? profiled(ctx.cdp, () => steps.search(ctx)).then((p) => p.top) : Promise.resolve(null))],
  // Last: it reloads the page.
  ['searchAfterFocus', steps.searchAfterFocus],
];

function options() {
  const { values } = parseArgs({
    options: {
      label: { type: 'string', default: 'run' },
      n: { type: 'string', default: '10000,100000,500000,1000000' },
      browsers: { type: 'string', default: 'chrome,firefox' },
      timeout: { type: 'string', default: '120' },
    },
  });
  return { label: values.label, sizes: values.n.split(',').map(Number), browsers: values.browsers.split(','), timeoutMs: Number(values.timeout) * 1_000 };
}

/** Builds the bench page (production React) and serves it with `vite preview` on PORT; resolves once it answers. */
async function startServer(): Promise<ChildProcess> {
  const build = spawn('node_modules/.bin/vite', ['build', 'bench', '--logLevel', 'error'], { stdio: 'inherit' });
  const code = await new Promise((resolve) => build.on('exit', resolve));
  if (code !== 0) throw new Error('vite build bench failed');
  const server = spawn('node_modules/.bin/vite', ['preview', 'bench', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    const up = await fetch(`http://localhost:${PORT}/`).then((res) => res.ok, () => false);
    if (up) return server;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill();
  throw new Error(`vite did not start on port ${PORT}`);
}

function launch(name: string): Promise<Browser> {
  const flags = ['--enable-precise-memory-info', '--js-flags=--max-old-space-size=8192'];
  // Playwright hides scrollbars in headless Chrome by default; the drag step needs them.
  if (name === 'chrome') return chromium.launch({ executablePath: CHROME, args: flags, ignoreDefaultArgs: ['--hide-scrollbars'] });
  return firefox.launch();
}

/** `work` or a rejection after `ms`: a hung step reports instead of stalling the run. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms / 1_000}s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

async function runStep(step: Step, ctx: StepContext, crashed: () => boolean): Promise<StepResult> {
  const start = Date.now();
  try {
    const value = await withTimeout(step(ctx), ctx.timeoutMs);
    return { ms: Date.now() - start, value };
  } catch (error) {
    const reason = crashed() ? 'crash' : (error as Error).message.split('\n')[0];
    return { ms: Date.now() - start, error: reason };
  }
}

/** Every step at one row count, in a fresh context; after a timeout or crash the rest are skipped. */
async function runSize(browser: Browser, name: string, n: number, timeoutMs: number): Promise<RunResult> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let crashed = false;
  page.on('crash', () => (crashed = true));
  const cdp = name === 'chrome' ? await context.newCDPSession(page) : null;
  await page.goto(`http://localhost:${PORT}/?n=${n}`, { waitUntil: 'commit' });
  const result: RunResult = { browser: name, version: browser.version(), n, steps: {} };
  let failed = false;
  for (const [stepName, step] of STEPS) {
    const limit = stepName === 'load' ? timeoutMs * 3 : timeoutMs;
    result.steps[stepName] = failed ? { ms: 0, error: 'skipped' } : await runStep(step, { page, cdp, timeoutMs: limit }, () => crashed);
    failed ||= /^(timeout|crash)/.test(result.steps[stepName].error ?? '');
    process.stderr.write(`${name} n=${n} ${stepName}: ${JSON.stringify(result.steps[stepName]).slice(0, 200)}\n`);
  }
  await withTimeout(context.close(), 30_000).catch(() => undefined);
  return result;
}

async function runBrowser(name: string, sizes: number[], timeoutMs: number): Promise<RunResult[]> {
  const browser = await launch(name);
  const results: RunResult[] = [];
  try {
    for (const n of sizes) results.push(await runSize(browser, name, n, timeoutMs));
  } finally {
    await browser.close().catch(() => undefined);
  }
  return results;
}

async function main(): Promise<void> {
  const { label, sizes, browsers, timeoutMs } = options();
  const server = await startServer();
  const stop = () => server.kill();
  process.on('SIGINT', () => process.exit(130));
  process.on('exit', stop);
  const results: RunResult[] = [];
  try {
    for (const name of browsers) {
      const done = await runBrowser(name, sizes, timeoutMs).catch((error: Error) => {
        process.stderr.write(`${name} failed: ${error.message}\n`);
        return [];
      });
      results.push(...done);
    }
  } finally {
    stop();
  }
  const machine = { cpu: cpus()[0]?.model, cores: cpus().length, node: process.version, date: new Date().toISOString() };
  await mkdir('bench/results', { recursive: true });
  await writeFile(`bench/results/${label}.json`, `${JSON.stringify({ label, machine, results }, null, 2)}\n`);
  process.stdout.write(markdown(results));
}

await main();
