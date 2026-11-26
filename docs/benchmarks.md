# Benchmarks

`npm run bench` measures client mode (`rows`, virtualized, no pagination) at 10k, 100k,
500k and 1M rows in Chrome and Firefox. This file holds the method and the BEFORE baseline
taken on branch `perf/million-rows` at `0ecc48d`, before any performance change.

## Running it

```bash
npm run bench                                   # every size, Chrome + Firefox, label "run"
npm run bench -- --label before                 # writes bench/results/before.json
npm run bench -- --n 10000,1000000 --browsers chrome --timeout 60
```

The harness (`bench/harness/run.ts`, run by Node's type stripping) builds the bench page
with `vite build bench` (production React, unminified so CPU profiles keep function names,
output in `node_modules/.cache/bench-dist`), serves it with `vite preview` on port 5299
(`--strictPort`), runs every step for each browser and size, stops the server, writes
`bench/results/<label>.json` and prints the tables below as markdown.

Browsers: system Chrome (`/usr/bin/google-chrome`) through `playwright-core`, and
Playwright's own Firefox build. `playwright-core` is pinned to **1.61.0**, the release that
drives the `firefox-1532` build present in `~/.cache/ms-playwright`; a newer release
expects a newer Firefox build. Both run headless at a 1280×900 viewport.

Each step has a timeout (`--timeout`, default 120 s; 3× for the initial load). A step that
times out or crashes the tab is reported as such and the remaining steps for that size are
skipped, so a hung 1M case does not stop the run.

## The bench page

`bench/main.tsx` renders `BTTable` with the demo's eight columns (`demo/data.tsx`: id,
name, notes of 5–400 chars, amount, created date, status select, tags, email) and
`generateRows(n, 42)`, so data is deterministic. `n` comes from `?n=`. Rows are generated
before mounting and the generation is excluded: `performance.mark('gen-start' / 'gen-end')`
around it, `mount-start` just before `render`. Props: `pagination={false}`, `selectable`,
`searchDebounceMs={0}` (so search timing is the work, not the debounce), `maxHeight={600}`,
default `estimatedRowHeight` (40). No `StrictMode`.

`window.__bench` exposes the handle ref and the probes (`bench/probes.ts`). No library code
is changed: `ResizeObserver` is replaced by a timing subclass before the table mounts, and
everything else is observed from the DOM or through CDP.

## What each column means

| Column | How it is measured |
|---|---|
| gen ms | `generateRows` time (excluded from everything else) |
| first rows ms | `mount-start` → one rAF after the first `tr.btt-row` exists (that frame has painted) |
| heap MB | Chrome only: CDP `HeapProfiler.collectGarbage`, then `Performance.getMetrics` `JSHeapUsedSize` |
| wheel p50/p95/max | rAF deltas while Playwright sends `mouse.wheel(0, 1500)` back to back for 3 s over the scroll area |
| drag p50/p95/max | rAF deltas while the scrollbar thumb of `.btt-scroll` is dragged top → bottom in 60 steps, 30 ms apart |
| header drift px | max change of any `thead th` left/width (viewport px) sampled every frame during wheel / drag |
| RO cb p95/max | duration of each `ResizeObserver` callback (the library's `applyMeasurements` batches) during the wheel run |
| offsets pass ms | the `offsetsOf` pass replicated in the page at this `n` (`rows.map(h ?? 40)` + `rowOffsets`), median of 5 |
| max scrollHeight | `.btt-scroll` `scrollHeight` after `scrollTop = scrollHeight` |
| last row: drag / End key / scrollTop=max / scrollToRow | after the thumb drag, after `End` (a cell is clicked first so the scroller takes keys), after `scrollTop = scrollHeight`, after `handle.scrollToRow(lastId)` — each settled (scroll position steady for 5 frames). ✓ = row N mounted and fully visible, "in DOM" = mounted but not fully visible, ✗ = not mounted, with the id of the last mounted row |
| search ms | `input` event of pasting `lopes` (one event) → first row changed + painted |
| clear ms | `Backspace` over the selected term → first row changed + painted |
| sort asc/desc ms | click on the Amount sort button → first row changed + painted |
| select all / none ms | click on the header checkbox → first row's checkbox changed + painted |

Chrome additionally records a CPU profile (CDP `Profiler`, 200 µs sampling) around a second
wheel run and a second search, kept in the JSON as the top self-time functions.

## Machine

- AMD Ryzen 7 5800X3D (8 cores; 12 logical CPUs given to WSL2), 31 GB RAM
- Linux 6.18.58.1-microsoft-standard-WSL2, Node v24.22.3
- Google Chrome 157.0.8103.78 (headless, system install)
- Firefox 151.0 (Playwright build 1532, headless)
- 60 Hz frame cadence (16.7 ms frames in Chrome, 17.1 ms in Firefox)

## BEFORE (0ecc48d)

Rendering and scrolling:

| browser | n | gen ms | first rows ms | heap MB | wheel p50/p95/max ms | drag p50/p95/max ms | header drift px | RO cb p95/max ms | offsets pass ms |
|---|---|---|---|---|---|---|---|---|---|
| chrome 157 | 10,000 | 19 | 40 | 7 | 16.7 / 16.8 / 17 | 16.7 / 16.8 / 17 | 0.0 / 0.0 | 0.1 / 0.2 | 0.4 |
| chrome 157 | 100,000 | 152 | 83 | 52 | 16.7 / 16.8 / 17 | 16.7 / 16.8 / 17 | 0.0 / 0.0 | 0.1 / 0.2 | 3.3 |
| chrome 157 | 500,000 | 1033 | 502 | 247 | 16.7 / 33.3 / 67 | 16.7 / 16.8 / 33 | 0.0 / 0.0 | 0.2 / 0.3 | 19.6 |
| chrome 157 | 1,000,000 | 1190 | 579 | 492 | 16.7 / 33.4 / 67 | 16.7 / 33.4 / 383 | 0.0 / 0.0 | 0.1 / 0.3 | 27.8 |
| firefox 151 | 10,000 | 23 | 76 | n/a | 17.1 / 17.1 / 17 | n/a | 0.0 / n/a | 0.0 / 1.0 | 0.0 |
| firefox 151 | 100,000 | 234 | 123 | n/a | 17.1 / 17.1 / 17 | n/a | 0.0 / n/a | 1.0 / 1.0 | 4.0 |
| firefox 151 | 500,000 | 1301 | 390 | n/a | 17.1 / 50.3 / 83 | n/a | 0.0 / n/a | 1.0 / 1.0 | 31.0 |
| firefox 151 | 1,000,000 | 2357 | 758 | n/a | 17.1 / 83.4 / 101 | n/a | 0.0 / n/a | 0.0 / 0.0 | 46.0 |

Reachability and interactions:

| browser | n | max scrollHeight px | last row: drag | End key | scrollTop=max | scrollToRow | search ms | clear ms | sort asc/desc ms | select all / none ms |
|---|---|---|---|---|---|---|---|---|---|---|
| chrome 157 | 10,000 | 610443 | ✗ (last 4779) | ✗ (last 9835) | ✗ (last 9999) | ✓ | 42 | 39 | 31 / 31 | 30 / 27 |
| chrome 157 | 100,000 | 4234768 | ✗ (last 50150) | ✗ (last 99717) | in DOM | ✓ | 270 | 49 | 95 / 74 | 45 / 27 |
| chrome 157 | 500,000 | 20165602 | ✗ (last 252356) | ✗ (last 499846) | in DOM | ✓ | 782 | 137 | 820 / 426 | 187 / 79 |
| chrome 157 | 1,000,000 | 33554430 | ✗ (last 833970) | ✗ (last 833933) | ✗ (last 833933) | ✗ (last 833933) | 1458 | 220 | 1306 / 1038 | 410 / 192 |
| firefox 151 | 10,000 | 473683 | no scrollbar | ✗ (last 9852) | in DOM | ✓ | 43 | 26 | 40 / 32 | 12 / 14 |
| firefox 151 | 100,000 | 4073542 | no scrollbar | ✗ (last 99841) | in DOM | ✓ | 225 | 40 | 140 / 115 | 47 / 31 |
| firefox 151 | 500,000 | 17895430 | no scrollbar | ✗ (last 446454) | ✗ (last 446454) | ✗ (last 446454) | 940 | 177 | 10653 / 25940 | 295 / 150 |
| firefox 151 | 1,000,000 | 17895430 | no scrollbar | ✗ (last 238359) | ✗ (last 235887) | ✗ (last 236830) | timeout | timeout | click timeout (30 s) | skipped |

Single run; frame times are quantized to the 60 Hz cadence, so treat p95 values of one or
two frames (33/50 ms) as "drops frames", not as precise numbers.

## Hypotheses

### 1. Height cap — CONFIRMED (Chrome and Firefox)

The spacers are real pixels (`Spacer` rows, `src/components/TableBody.tsx:249-256`), the
total is the sum of the measured or estimated (40 px) heights. The real mean row height of
the demo data is ~61 px (610,443 px / 10k rows), so the total grows as rows get measured.

- **Chrome** caps `scrollHeight` at **33,554,430 px** (2²⁵ − 2). At 1M rows the table
  needs ≥ 40M px; the last row reachable by any route (drag, End, `scrollTop = max`,
  `scrollToRow`) is **~833,950**, i.e. the last ~166k rows (16.6%) are unreachable.
  `scrollToRow(1000000)` is accepted (returns `true`) but the row never becomes visible.
- **Firefox** caps at **17,895,430 px**. At 500k rows (≥ 20M px needed) the last
  reachable row is **446,454**; at 1M it is worse than the cap alone predicts: every
  route lands at `scrollTop` ≈ 9.5M (not the 17.9M maximum) and the last mounted row is
  ~236k–238k — the browser's scroll range and the table's own offsets disagree once the
  spacers exceed the cap.

### 2. Offsets recomputed for all n rows on every measurement — CONFIRMED, but not in the ResizeObserver path

- The ResizeObserver callbacks themselves are cheap at every size (p95 ≤ 0.2 ms, max
  0.3 ms in Chrome at 1M): by the time they fire, the rows were already measured in the
  layout effect, so `storeHeights` reports no change and `offsetsOf` is skipped
  (`src/hooks/useVirtualRows.ts:102`).
- The O(n) pass runs in the **post-commit layout effect**: `useMeasureAfterCommit`
  (`src/hooks/useVirtualRows.ts:188-205`) → `applyMeasurements(shared, rows)` (`:204`) →
  `offsetsOf` (`:103`, defined `:50-52`: `entries.map(...)` + `rowOffsets`,
  `src/core/virtual.ts:7-12`) on every commit that mounts a not-yet-measured row, i.e. on
  nearly every scroll frame. One pass costs **27.8 ms (Chrome) / 46 ms (Firefox) at 1M**,
  19.6 / 31 ms at 500k, ~3–4 ms at 100k.
- Chrome CPU profile of 3 s of wheel scrolling at 1M: `offsetsOf` + its map callback
  **1,609 ms self**, `rowOffsets` **304 ms** — ~1.9 s, more than half the main thread
  (≈ 65–70 passes). At 500k: 1,124 + 217 ms. At 10k it is noise (24 ms).
- Each pass also allocates two n-length arrays (8 MB each at 1M), and `setLayout` with the
  new array re-renders the table.
- Same file, a second cost per measurement at small n: `applyMeasurements` self time is
  ~370–390 ms per 3 s wheel run at 10k/100k — forced synchronous layout from reading
  `scroller.clientHeight` (`:100`) and writing/reading `scrollTop` (`:105`, `:108`) right
  after the commit's DOM writes. It does not drop frames below 100k.

### 3. Client filter / sort cost at 1M — CONFIRMED (blocking, seconds)

| at 1M | Chrome | Firefox |
|---|---|---|
| search "lopes" (83,404 matches) | 1,458 ms | timeout (> 120 s) |
| clear search | 220 ms | timeout |
| sort asc / desc (Amount) | 1,306 / 1,038 ms | page unresponsive (click timed out after 30 s); at 500k already 10.7 s / 25.9 s |
| select all / none | 410 / 192 ms | — (skipped); 295 / 150 ms at 500k |

Where the time goes (Chrome profile of one search at 1M):
- `matchesSearch` (`src/core/search.ts:26-32`) builds a search string per column per row on
  every keystroke: `columnSearchText` → `searchText` → `formatValue` + **`parseDate` on
  every value** (`src/core/search.ts:9-14`), then `.toLowerCase()` (`:30`). Nothing is
  cached between keystrokes. `parseDate` 172 ms, `formatObject` 82 ms, the
  `filterRows` callback 861 ms (`src/core/filters.ts:144`).
- `filterEntries` maps all entries to rows first (`src/hooks/rowModel.ts:48`).
- Sort reads each key once (`src/hooks/rowModel.ts:69`), but `compareValues` rebuilds a
  `SortKey` object for both sides on **every comparison** (`src/core/compare.ts:18-28`,
  called `:30-31`): `toNumber`/`parseDate`/`formatValue` and two allocations per compare,
  ~20M compares at 1M. This is the likely reason Firefox degrades to tens of seconds.
- After filter/sort, more O(n) derived lists (below) run in the same commit.

### 4. Other O(n) paths per render / per change

Per scroll frame (the ones that matter for scrolling):
- `src/hooks/useVirtualRows.ts:103` / `:50-52` — `offsetsOf` (above).
- `src/hooks/useVirtualRows.ts:255` — `useOffsets` recomputes `offsetsOf` when the list
  or estimate changed (once per filter/sort, not per frame).

Per data / view change (filter, sort, search, select all):
- `src/hooks/useVirtualRows.ts:122-126` — `pruneHeights` builds a `Set` of every id on
  each new list (66 ms in the 1M search profile), from `useListChange` (`:244`).
- `src/hooks/useClientTable.ts:123` — `filteredRows = sorted.map(entry => entry.row)`.
- `src/hooks/useClientTable.ts:127` — `presentIds = new Set(all ids)` (per `rows` change).
- `src/hooks/useClientTable.ts:128` — `scopeIds = sorted.map(id)`.
- `src/hooks/useClientTable.ts:75` — `sameState` compares `filteredRows` element by element
  when two lists have the same length (every sort change).
- `src/hooks/useClientTable.ts:142` — `viewKey` `JSON.stringify` (cheap, constant size).
- `src/hooks/useSelection.ts:148-151` — `new Set(selected)` and `scopeIds.every/some` per
  selection change; `:72-76` select-all builds `Set`s of selected + scope (410 ms select
  all at 1M in Chrome).
- `src/hooks/useSelectedRows.ts:34` — `Map` of every id → row per `entries` change.
- `src/hooks/useRowWarnings.ts:20` — duplicate-id `Set` of every id per `entries` change;
  `:43` a dev-only `entries.some` scan.
- `src/hooks/rowModel.ts:26-36` — `buildEntries`, one entry object per row per `rows`
  change (part of the 579 ms first render at 1M).

Per call:
- `src/BTTable.tsx:218` — `clientPageOf` `findIndex` over all filtered rows on every
  `scrollToRow` / `focusCell`.
- `src/hooks/useTableHandle.ts:146` — `settle` `findIndex` over all entries while a scroll
  request is pending.

### Other findings

- **End key and `scrollTop = scrollHeight` miss the last row at every size**, 10k
  included (End lands on row 9,835 of 10,000 in Chrome). They jump to the bottom of the
  estimated height; the rows mounted there measure taller than 40 px, and the anchoring in
  `applyMeasurements` (`src/hooks/useVirtualRows.ts:104-105`) keeps the first visible row
  in place, so the content grows below the viewport.
- **Dragging the scrollbar thumb to the bottom stops at ~50–65%** for 10k–500k in Chrome
  (row 4,779 / 10k, 50,150 / 100k, 252,356 / 500k). A plain 4M px `div` dragged with the
  same harness code reaches its bottom, so this is the table: `scrollHeight` grows
  during the drag (estimate 40 px vs ~61 px real) while `applyMeasurements` rewrites
  `scrollTop` under the dragged thumb. At 1M the cap hides it (height cannot grow).
- **Header drift is 0 px** in every run.
- First render stays under 0.8 s at 1M; generation (not part of the table) is 1.2–2.4 s.
  JS heap at 1M is 492 MB in Chrome, mostly the generated rows plus one entry object per
  row.

## What did not work

- **Headless Firefox draws no scrollbar** (`scrollbar-width` computes to `none`, scrollbar
  width 0), so the drag step reports "no scrollbar" there. Headed Firefox has one (17 px),
  but the harness stays headless so it does not open windows.
- Headless Chrome hides scrollbars by default under Playwright; the harness launches it
  without `--hide-scrollbars`.
- Firefox heap is not measured (no `performance.memory`, no CDP).
- Firefox at 1M: sort and search hang the page past the timeouts; the rest of that size
  was skipped.
