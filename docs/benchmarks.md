# Benchmarks

`npm run bench` measures client mode (`rows`, virtualized, no pagination) at 10k, 100k,
500k and 1M rows in Chrome and Firefox. This file holds the method, the BEFORE baseline
taken on branch `perf/million-rows` at `0ecc48d` (before any performance change), the AFTER
run on the same branch with every change applied (`bench/results/after.json`), what changed
and why, and the limits that remain.

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
| offsets pass ms | **BEFORE:** the `offsetsOf` pass replicated in the page at this `n` (`rows.map(h ?? 40)` + `rowOffsets`), median of 5 — it ran on every measurement. **AFTER** the column holds two numbers, because that pass no longer exists: *per measurement* = one measurement batch on the Fenwick tree (20 `set` + 2 `offset` + 1 `rowAt`, averaged over 1,000 rounds), *per list* = one `buildTree` (heights array + tree, once per new row list: sort, search, filter, new data), each median of 5. Compare BEFORE's single number with AFTER's *per measurement* number (what scrolling pays); *per list* is what a sort or search pays once |
| max scrollHeight | `.btt-scroll` `scrollHeight` after `scrollTop = scrollHeight` |
| last row: drag / End key / scrollTop=max / scrollToRow | after the thumb drag, after `End` (a cell is clicked first so the scroller takes keys), after `scrollTop = scrollHeight`, after `handle.scrollToRow(lastId)` — each settled (scroll position steady for 5 frames). ✓ = row N mounted and fully visible, "in DOM" = mounted but not fully visible, ✗ = not mounted, with the id of the last mounted row |
| search ms (BEFORE) / search first | `input` event of pasting `lopes` (one event) → first row changed + painted. AFTER: pasted right after clicking the box, so the focus warm-up has had no time; the query builds the rest of the search texts |
| search later | after clearing, pasting `lope` (does not extend `lopes`, so every prebuilt text is scanned) → first row changed + painted |
| first search after 2 s focus | page reloaded, search box focused, 2 s wait (a user about to type), then the same `lopes` paste |
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

Same machine; Chrome 157 / Firefox 151, single run.

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

## AFTER (perf/million-rows, every change)

`bench/results/after.json`, same machine and browsers, single run (`npm run bench -- --label
after --n 10000,100000,500000,1000000 --browsers chrome,firefox`). Two intermediate runs
are kept for reference: `after-data.json` (search/filter/sort changes on the old
virtualization) and `after-virtual.json` (virtualization changes).

Rendering and scrolling:

| browser | n | gen ms | first rows ms | heap MB | wheel p50/p95/max ms | drag p50/p95/max ms | header drift px | RO cb p95/max ms | offsets ms (per measurement / per list) |
|---|---|---|---|---|---|---|---|---|---|
| chrome 157 | 10,000 | 52 | 88 | 7 | 16.7 / 33.3 / 50 | 16.7 / 16.8 / 50 | 0.0 / 0.0 | 0.3 / 2.4 | 0.001 / 0.5 |
| chrome 157 | 100,000 | 148 | 56 | 49 | 16.7 / 16.7 / 17 | 16.7 / 16.7 / 17 | 0.0 / 0.0 | 0.1 / 0.2 | 0.001 / 2.9 |
| chrome 157 | 500,000 | 657 | 83 | 232 | 16.7 / 16.7 / 17 | 16.7 / 16.8 / 17 | 0.0 / 0.0 | 0.1 / 0.7 | 0.001 / 15.7 |
| chrome 157 | 1,000,000 | 1315 | 205 | 462 | 16.7 / 16.7 / 17 | 16.7 / 16.8 / 17 | 0.0 / 0.0 | 0.1 / 0.2 | 0.001 / 33.0 |
| firefox 151 | 10,000 | 28 | 65 | n/a | 17.1 / 17.1 / 134 | n/a | 0.0 / n/a | 0.0 / 1.0 | 0.001 / 0.0 |
| firefox 151 | 100,000 | 219 | 72 | n/a | 17.1 / 17.1 / 17 | n/a | 0.0 / n/a | 0.0 / 1.0 | 0.001 / 5.0 |
| firefox 151 | 500,000 | 1294 | 151 | n/a | 17.1 / 17.1 / 17 | n/a | 0.0 / n/a | 0.0 / 1.0 | 0.001 / 19.0 |
| firefox 151 | 1,000,000 | 2417 | 290 | n/a | 17.1 / 17.1 / 17 | n/a | 0.0 / n/a | 0.0 / 1.0 | 0.001 / 32.0 |

The 10k frame spikes (Chrome p95 33 ms / max 50 ms, Firefox max 134 ms) are the first size
of each browser run, i.e. JIT warm-up; 100k–1M hold 60 Hz throughout.

Reachability and interactions:

| browser | n | max scrollHeight px | last row: drag | End key | scrollTop=max | scrollToRow | search first / later ms | first search after 2 s focus ms | clear ms | sort asc/desc ms | select all / none ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chrome 157 | 10,000 | 582499 | ✓ | ✓ | ✓ | ✓ | 59 / 31 | 44 | 45 | 21 / 31 | 30 / 30 |
| chrome 157 | 100,000 | 4297449 | ✓ | ✓ | ✓ | ✓ | 207 / 31 | 45 | 44 | 45 / 31 | 29 / 30 |
| chrome 157 | 500,000 | 15000058 | ✓ | ✓ | ✓ | ✓ | 862 / 60 | 82 | 48 | 197 / 88 | 64 / 59 |
| chrome 157 | 1,000,000 | 15000057 | ✓ | ✓ | ✓ | ✓ | 1713 / 110 | 121 | 62 | 474 / 191 | 146 / 138 |
| firefox 151 | 10,000 | 461774 | no scrollbar | ✓ | ✓ | ✓ | 26 / 31 | 25 | 26 | 24 / 31 | 13 / 15 |
| firefox 151 | 100,000 | 4064714 | no scrollbar | ✓ | ✓ | ✓ | 306 / 31 | 41 | 27 | 57 / 31 | 30 / 32 |
| firefox 151 | 500,000 | 15000058 | no scrollbar | ✓ | ✓ | ✓ | 1359 / 65 | 75 | 43 | 242 / 165 | 80 / 97 |
| firefox 151 | 1,000,000 | 15000058 | no scrollbar | ✓ | ✓ | ✓ | 3120 / 115 | 1362 | 75 | 493 / 264 | 196 / 165 |

`scrollToRow(1000000)` makes the row visible in 148 ms (Chrome) / 248 ms (Firefox). The
heap is measured before any search; the search texts add to it once search is used.

### BEFORE → AFTER at 1M rows

| at 1M | Chrome BEFORE | Chrome AFTER | Firefox BEFORE | Firefox AFTER |
|---|---|---|---|---|
| first rows | 579 ms | 205 ms | 758 ms | 290 ms |
| heap | 492 MB | 462 MB | n/a | n/a |
| wheel p50 / p95 / max | 16.7 / 33.4 / 67 | 16.7 / 16.7 / 17 | 17.1 / 83.4 / 101 | 17.1 / 17.1 / 17 |
| drag p50 / p95 / max | 16.7 / 33.4 / 383 | 16.7 / 16.8 / 17 | n/a (no scrollbar) | n/a |
| last row reachable (drag / End / scrollTop=max / scrollToRow) | ✗ ✗ ✗ ✗ (stops at ~834k) | ✓ ✓ ✓ ✓ | – ✗ ✗ ✗ (stops at ~236k) | – ✓ ✓ ✓ |
| offsets work per measurement | 27.8 ms | 0.001 ms | 46 ms | 0.001 ms |
| search first / later | 1,458 ms (every search) | 1,713 / 110 ms | timeout (> 120 s) | 3,120 / 115 ms |
| first search, 2 s after focus | – | 121 ms | – | 1,362 ms |
| clear search | 220 ms | 62 ms | timeout | 75 ms |
| sort asc / desc | 1,306 / 1,038 ms | 474 / 191 ms | page hangs (> 30 s) | 493 / 264 ms |
| select all / none | 410 / 192 ms | 146 / 138 ms | skipped | 196 / 165 ms |
| header drift | 0 px | 0 px | 0 px | 0 px |

## What changed and why

- **Height cap + scroll mapping** (`src/core/scrollMap.ts`). Chrome caps an element at
  ~33.5M px and Firefox at ~17.9M px, so the bottom rows were unreachable. The rows now get
  at most `MAX_SCROLL_SPACE` = 15M px of scroll space (under both caps). Above that a scroll
  position maps to a content position, `top = scrollTop + delta`, with `delta` fixed per
  page of content (space / 100), so small scrolls move the content 1 px per px and large
  jumps (thumb drag, End, Home, `scrollToRow`) map proportionally; the first page has
  delta 0 and the last `total − space`, so both ends are exact. Below the cap nothing is mapped.
- **Fenwick tree of row heights** (`src/core/heightTree.ts`). The old code rebuilt an O(n)
  offsets array (27.8 ms at 1M) on almost every scroll frame. Heights now live in a binary
  indexed tree: a measurement, a row's offset and the row at an offset are O(log n). The
  tree is built once per row list (`buildTree`, ~33 ms at 1M), and an id → index map is
  built once per list for the handle's lookups.
- **Bottom anchoring + drag freeze** (`src/hooks/virtualScroll.ts`). End and
  `scrollTop = max` missed the last row because rows measured taller than the 40 px estimate
  grew the content below the viewport. While the view is at the bottom it now stays pinned
  there as heights change, and End jumps to the last row and holds it while the rows near it
  are measured. During a thumb drag the body height is frozen (and `scrollTop` is not
  rewritten), so the thumb is not pulled from under the pointer; heights apply on release.
- **Cached search/filter keys** (`src/hooks/rowIndex.ts`). Per `rows` × `columns`, each
  row's lowercase search text and each filter column's `filterKey` are computed once and
  stored by row index, so a keystroke is one `includes` per row, and a term that extends the
  previous one only rechecks the previous result.
- **Rank-based counting sort** (`src/core/sortRanks.ts`). Per sort column, every row's sort
  key is turned once into a dense integer rank (radix sort for numbers, sorted words for
  text); a sort is then a stable O(n) counting sort on ranks, in either direction, giving the
  same order as the `compareValues` comparison sort (checked in `rowIndex.test.ts`).
- **Lazy search text, warmed on focus** (`src/hooks/useClientTable.ts`). Building every
  search text costs ~1.7 s (Chrome) / ~3 s (Firefox) at 1M and ~one string per row of
  memory, so a table nobody searches never builds them. Building starts when the search box
  gets focus (or a term is first entered) and runs in 8 ms slices between frames; a query
  that arrives first finishes the rest synchronously. Client mode only.

## Where the 1M Chrome sort time goes

CPU profile (CDP, 100 µs sampling) of the sort step (Amount asc, desc, unsorted) at 1M:

- **Rank build for the column, once per column per row list: ~200 ms** — `rankNumbers`,
  `radixPass`, `ranksOf`, `rankTexts` and the key reads. Only the first sort of a column
  pays it, which is why asc (first) is 474 ms and desc (ranks reused) 191 ms.
- **Per new list, every sort click: ~120–150 ms of JS** — `orderByRanks` (~50 ms),
  `buildTree` + `HeightTree` (~40 ms, the virtualization's heights for the new order),
  `scopeIds = sorted.map(id)` in `useClientTable` (~32 ms, selection scope), plus GC of the
  previous lists (~60 ms per click) and React's render/layout.

No single avoidable O(n) pass dominates: the tree build is needed (heights follow the new
order) and `scopeIds` is the only pass that could be made lazy (~30 ms). So 1M asc stays
above 300 ms on the first sort of a column; later sorts are ~190 ms (Chrome) / ~260 ms (Firefox).

## Remaining limits

- **First sort of a column at 1M: ~470–490 ms** (rank build); later sorts 190–265 ms.
- **First search at 1M without warm-up: 1.7 s (Chrome) / 3.1 s (Firefox).** Focusing the box
  hides it if the user takes long enough before typing: after 2 s Chrome is done (121 ms),
  Firefox is not (1,362 ms: its warm-up takes longer than 2 s). Later searches ~110 ms.
- **Memory:** ~460–470 MB JS heap at 1M in Chrome (mostly the rows themselves plus one entry
  object per row), plus one search string per row once search is used.
- **Scroll mapping above 15M px:** the scrollbar maps proportionally, so at 1M one pixel of
  thumb travel spans many rows; fine positioning is by wheel/keys, not the thumb.
- **Firefox drag is unmeasured:** headless Firefox draws no scrollbar.
- Single run per size; frame times are quantized to 60 Hz.
- Beyond ~1M rows, or with heavier rows, use server or manual mode.

## BEFORE findings (0ecc48d)

What the BEFORE run showed, with the code locations of that commit.

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
- `filterEntries` maps all entries to rows first (`src/hooks/rowModel.ts:48`; removed since).
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
