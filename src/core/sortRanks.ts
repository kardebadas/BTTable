import { type SortKey, textCollator } from './compare';

/** The rank of a blank key: blanks sort last in both directions. */
export const BLANK_SORT_RANK = -1;

/**
 * Dense ascending ranks of sort keys, parallel to the keys: two keys share a rank exactly
 * when `compareSortKeys` calls them equal, and a lower rank sorts first. Blanks get
 * `BLANK_SORT_RANK`. `count` is the number of distinct present ranks.
 */
export type SortRanks = { ranks: Int32Array; count: number };

/** Ranks every key once (numbers, then dates, then text), so later sorts compare integers or count. */
export function sortRanks(keys: readonly SortKey[]): SortRanks {
  const ranks = new Int32Array(keys.length).fill(BLANK_SORT_RANK);
  const nums = new Float64Array(keys.length);
  const numbers: number[] = [];
  const dates: number[] = [];
  keys.forEach((key, i) => {
    nums[i] = key.num;
    if (key.rank === 0) numbers.push(i);
    else if (key.rank === 1) dates.push(i);
  });
  let count = rankNumbers({ nums, positions: numbers, ranks }, 0);
  count += rankNumbers({ nums, positions: dates, ranks }, count);
  count += rankTexts(keys, ranks, count);
  return { ranks, count };
}

/** Numeric keys by position, the positions of one kind, and the ranks to write. */
type NumberKind = { nums: Float64Array; positions: readonly number[]; ranks: Int32Array };

/** Ranks `positions` by `nums` from `offset` (equal numbers, -0 and 0 included, share a rank); returns the ranks used. */
function rankNumbers({ nums, positions, ranks }: NumberKind, offset: number): number {
  const order = radixOrder(nums, positions);
  let rank = offset - 1;
  let previous = Number.NaN;
  for (const position of order) {
    if (nums[position] !== previous) rank += 1;
    previous = nums[position];
    ranks[position] = rank;
  }
  return rank + 1 - offset;
}

/** Index of the high 32-bit word of a float64 in a Uint32Array view on this platform. */
const HIGH_WORD = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 1 : 0;

/**
 * The 64 bits of each number as two unsigned words whose unsigned order is the numeric
 * order: negative numbers have every bit flipped, others only the sign bit.
 */
function orderedWords(nums: Float64Array, positions: readonly number[]): { high: Uint32Array; low: Uint32Array } {
  const words = new Uint32Array(nums.buffer);
  const high = new Uint32Array(positions.length);
  const low = new Uint32Array(positions.length);
  positions.forEach((position, i) => {
    const hi = words[2 * position + HIGH_WORD];
    const lo = words[2 * position + 1 - HIGH_WORD];
    const negative = hi >>> 31 === 1;
    high[i] = negative ? ~hi >>> 0 : (hi | 0x80000000) >>> 0;
    low[i] = negative ? ~lo >>> 0 : lo;
  });
  return { high, low };
}

/**
 * `positions` in stable ascending order of their `nums`: an LSD radix sort on 16-bit
 * digits of the ordered bits, O(n) and without a comparator.
 */
function radixOrder(nums: Float64Array, positions: readonly number[]): Uint32Array {
  const { high, low } = orderedWords(nums, positions);
  let order: Uint32Array = new Uint32Array(positions.length);
  for (let i = 0; i < order.length; i += 1) order[i] = i;
  for (const words of [low, high]) {
    order = radixPass(order, words, 0);
    order = radixPass(order, words, 16);
  }
  for (let i = 0; i < order.length; i += 1) order[i] = positions[order[i]];
  return order;
}

/**
 * One stable counting pass of `order` on the 16-bit digit of `words` at `shift`; the same
 * array when every item has the same digit.
 */
function radixPass(order: Uint32Array, words: Uint32Array, shift: 0 | 16): Uint32Array {
  const starts = new Int32Array(0x10001);
  for (let i = 0; i < order.length; i += 1) starts[((words[order[i]] >>> shift) & 0xffff) + 1] += 1;
  if (starts.includes(order.length)) return order;
  for (let digit = 1; digit <= 0x10000; digit += 1) starts[digit] += starts[digit - 1];
  const next = new Uint32Array(order.length);
  for (let i = 0; i < order.length; i += 1) next[starts[(words[order[i]] >>> shift) & 0xffff]++] = order[i];
  return next;
}

/** Ranks text keys from `offset` with the shared collator; texts it calls equal share a rank. */
function rankTexts(keys: readonly SortKey[], ranks: Int32Array, offset: number): number {
  const distinct = new Set<string>();
  for (const key of keys) if (key.rank === 2) distinct.add(key.text);
  const sorted = Array.from(distinct).sort(textCollator.compare);
  const rankOf = new Map<string, number>();
  let rank = -1;
  sorted.forEach((text, i) => {
    if (i === 0 || textCollator.compare(sorted[i - 1], text) !== 0) rank += 1;
    rankOf.set(text, rank);
  });
  keys.forEach((key, i) => {
    if (key.rank === 2) ranks[i] = offset + (rankOf.get(key.text) as number);
  });
  return rank + 1;
}

/** Input of `orderByRanks`. */
export type RankOrderInput<T> = {
  items: readonly T[];
  /** The item's rank from `sortRanks`, `BLANK_SORT_RANK` for a blank. */
  rankOf: (item: T) => number;
  /** `SortRanks.count`. */
  count: number;
  direction: 'asc' | 'desc';
};

/**
 * `items` ordered by rank in O(n + count) with a stable counting sort: ascending or
 * descending ranks, items of equal rank in input order, blanks last in input order. The
 * same order a stable sort with `compareSortKeys` gives.
 */
export function orderByRanks<T>({ items, rankOf, count, direction }: RankOrderInput<T>): T[] {
  const bucketOf = (rank: number) => {
    if (rank === BLANK_SORT_RANK) return count;
    return direction === 'asc' ? rank : count - 1 - rank;
  };
  const buckets = new Int32Array(items.length);
  items.forEach((item, i) => {
    buckets[i] = bucketOf(rankOf(item));
  });
  const starts = new Int32Array(count + 2);
  for (const bucket of buckets) starts[bucket + 1] += 1;
  for (let bucket = 1; bucket <= count; bucket += 1) starts[bucket] += starts[bucket - 1];
  const order = new Int32Array(items.length);
  buckets.forEach((bucket, i) => {
    order[starts[bucket]++] = i;
  });
  // Pushed in order, so the result stays a packed array; a preallocated `new Array(n)`
  // of this size is a slow dictionary array in V8.
  const result: T[] = [];
  for (const i of order) result.push(items[i]);
  return result;
}
