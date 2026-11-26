/**
 * Scaled scrolling. Browsers cap an element's height (Chrome ~33.5M px, Firefox ~17.9M px),
 * so above `MAX_SCROLL_SPACE` the rows get a capped scroll space and a scroll position maps
 * to a content position: `top = scrollTop + delta`. The rows themselves stay real pixels,
 * placed `delta` px above their offset, so a small scroll moves the content 1 px per px.
 *
 * `delta` is fixed per page of content (`space / PAGES` px): crossing into another page
 * moves the scroll position (the thumb) by the page step instead of the content, as
 * SlickGrid does. The first page has delta 0 and the last `total - space`, so both ends
 * are reachable. Large jumps (thumb drag, End, Home, programmatic) map linearly.
 * Below the cap, `delta` is always 0 and `top` is the scroll position.
 */

/** Largest body height given to the scroll container; under every browser's cap, Firefox's included. */
export const MAX_SCROLL_SPACE = 15_000_000;

/** A scroll position this close to the end, in px, counts as the end (a thumb released at the track's end). */
export const END_SLOP = 3;

/** True when `scrollTop` is at the end of the scroll range. */
export function atEnd(geometry: ScrollGeometry, scrollTop: number): boolean {
  return scrollTop > 0 && scrollTop >= geometry.maxScroll - END_SLOP;
}

/** Pages of content per scroll space. */
const PAGES = 100;

/** Height of the rows in the scroll container: their total, capped. */
export function scrollSpace(total: number): number {
  return Math.min(total, MAX_SCROLL_SPACE);
}

/** The geometry a position is mapped in. */
export type ScrollGeometry = {
  /** Height of every row. */
  total: number;
  /** Height the rows take in the scroll container (`scrollSpace(total)`). */
  space: number;
  /** Largest scroll position. */
  maxScroll: number;
};

/** A view position: `top` is the content position at the top of the viewport, `delta` is `top - scrollTop`. */
export type ScrollPos = { top: number; delta: number };

/** Where a position puts the scroll container. */
export function scrollOf(pos: ScrollPos): number {
  return pos.top - pos.delta;
}

/** True when the scroll space is scaled (the rows are taller than it). */
export function isScaled(geometry: ScrollGeometry): boolean {
  return geometry.total > geometry.space;
}

/** Largest content position: the last row's bottom at the viewport's bottom. */
export function maxTop(geometry: ScrollGeometry): number {
  return Math.max(0, geometry.maxScroll + geometry.total - geometry.space);
}

function pageHeight(geometry: ScrollGeometry): number {
  return geometry.space / PAGES;
}

function pageCount(geometry: ScrollGeometry): number {
  return Math.max(2, Math.floor(geometry.total / pageHeight(geometry)));
}

/** The page holding content position `top`, the last one included. */
function pageOf(geometry: ScrollGeometry, top: number): number {
  return Math.min(pageCount(geometry) - 1, Math.floor(top / pageHeight(geometry)));
}

/** The delta of the page holding `top`: 0 on the first page, `total - space` on the last. */
function pageDelta(geometry: ScrollGeometry, top: number): number {
  return (pageOf(geometry, top) * (geometry.total - geometry.space)) / (pageCount(geometry) - 1);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Settles a proposed position: below the cap `delta` is 0. Above it `top` is clamped, and
 * `delta` becomes its page's delta when `top` moved to another page than `previousTop` or
 * sits on the last page (whose delta tracks the total exactly); else it is kept. The
 * resulting scroll position is kept inside the scroll range.
 */
export function settlePosition(geometry: ScrollGeometry, previousTop: number, next: ScrollPos): ScrollPos {
  if (!isScaled(geometry)) return { top: next.top, delta: 0 };
  const top = clamp(next.top, 0, maxTop(geometry));
  const last = pageCount(geometry) - 1;
  const repage = pageOf(geometry, top) !== pageOf(geometry, previousTop) || pageOf(geometry, top) === last;
  const delta = repage ? pageDelta(geometry, top) : next.delta;
  return { top, delta: top - clamp(top - delta, 0, geometry.maxScroll) };
}

/** Input of `positionAfterScroll`. */
export type ScrollInput = {
  previous: ScrollPos;
  /** The scroll position the browser reports. */
  scrollTop: number;
  geometry: ScrollGeometry;
  /** A jump (thumb drag, End, programmatic): map linearly instead of moving 1 px per px. */
  jump: boolean;
};

/**
 * The position after the browser scrolled: the ends map to the ends, a jump maps the scroll
 * fraction onto the content, and a small scroll moves the content by the same amount.
 */
export function positionAfterScroll({ previous, scrollTop, geometry, jump }: ScrollInput): ScrollPos {
  if (!isScaled(geometry)) return { top: scrollTop, delta: 0 };
  if (scrollTop <= 0) return { top: 0, delta: 0 };
  if (atEnd(geometry, scrollTop)) return { top: maxTop(geometry), delta: maxTop(geometry) - scrollTop };
  if (jump) return positionAt(geometry, scrollTop + ((geometry.total - geometry.space) * scrollTop) / geometry.maxScroll);
  return settlePosition(geometry, previous.top, { top: scrollTop + previous.delta, delta: previous.delta });
}

/** The position showing content position `top`, with the scroll position on the linear map (`scrollToRow`, jumps). */
export function positionAt(geometry: ScrollGeometry, top: number): ScrollPos {
  const end = maxTop(geometry);
  const target = clamp(top, 0, end);
  if (!isScaled(geometry)) return { top: target, delta: 0 };
  const scroll = end > 0 ? (target * geometry.maxScroll) / end : 0;
  return { top: target, delta: target - scroll };
}
