import { type RefObject, useEffect } from 'react';
import { flushSync } from 'react-dom';
import type { HeightTree } from '../core/heightTree';
import {
  atEnd,
  maxTop,
  positionAfterScroll,
  positionAt,
  type ScrollGeometry,
  type ScrollPos,
  scrollOf,
  scrollSpace,
  settlePosition,
} from '../core/scrollMap';
import type { RowEntry, RowId } from './rowModel';

/** Measured row heights by row id. Mutated in place: it outlives every row list. */
export type Heights = Map<RowId, number>;

/** What the observer callback, the scroll listener and the effects read: the latest committed state. */
export type Live<R> = {
  entries: readonly RowEntry<R>[];
  estimate: number;
  /** Heights of `entries` by position: measurements update it in place. */
  tree: HeightTree;
  /** Mounted row element (and its detail row) → its index in `entries`, rebuilt after each commit. */
  ids: WeakMap<Element, number>;
  /** The position on screen. */
  pos: ScrollPos;
  /** The container's scroll position as last read or written. */
  scroll: number;
  /** The view is at the bottom: row height changes keep the last row's bottom in view. */
  pinned: boolean;
  /**
   * While a pointer holds the scrollbar: the body height frozen at the press. Chrome drops
   * thumb moves whenever the scroll height changes, so it must not; the scroll position is
   * never rewritten then either. Null otherwise.
   */
  dragSpace: number | null;
  /** A scroll position the container could not take yet (it grows in the next commit). */
  pending: number | null;
};

/** State setters the measurements and listeners render through. */
export type Setters = { setPos: (pos: ScrollPos) => void; setViewport: (height: number) => void; setDragSpace: (space: number | null) => void };

/** Everything the measurement and scroll code shares, stable for the hook's life. */
export type Shared<R> = { live: RefObject<Live<R>>; cache: Heights; scrollRef: RefObject<HTMLElement | null>; setters: Setters };

/** The body height the rows get: their capped total, or the frozen height during a thumb drag. */
export function spaceOf<R>(live: Live<R>, total: number): number {
  return live.dragSpace ?? scrollSpace(total);
}

/**
 * The scroll geometry for the current rows while the container still holds the body of the
 * last render, `rendered` px tall: its largest scroll position grows with the new space.
 */
export function geometryOf<R>(live: Live<R>, scroller: HTMLElement, rendered: number): ScrollGeometry {
  const total = live.tree.total;
  const space = spaceOf(live, total);
  const height = scroller.scrollHeight;
  // Without layout (jsdom) the scroll height reads 0: the body alone stands in for it.
  const domMax = (height > 0 ? height : rendered) - scroller.clientHeight;
  return { total, space, maxScroll: Math.max(0, domMax + space - rendered) };
}

/** Writes the scroll position; one the container cannot take yet is retried after the next commit. */
function writeScroll<R>(live: Live<R>, scroller: HTMLElement, target: number): void {
  scroller.scrollTop = target;
  live.scroll = scroller.scrollTop;
  live.pending = Math.abs(live.scroll - target) < 1 ? null : target;
}

/** Retries a scroll position the container was too short for, now that the last commit resized it. */
export function applyPending<R>(live: Live<R>, scroller: HTMLElement): void {
  if (live.pending !== null) writeScroll(live, scroller, live.pending);
}

/** Makes `pos` the view: writes the scroll position it needs, then renders it. */
export function moveTo<R>(shared: Shared<R>, scroller: HTMLElement, pos: ScrollPos): void {
  const live = shared.live.current;
  live.pos = pos;
  const target = scrollOf(pos);
  live.scroll = scroller.scrollTop;
  if (Math.abs(target - live.scroll) >= 1) writeScroll(live, scroller, target);
  shared.setters.setPos(pos);
}

/**
 * The position after row heights changed, `top` being the anchored content position: kept
 * at the bottom while pinned there; during a thumb drag the scroll position is left alone.
 */
function measuredPosition<R>(live: Live<R>, geometry: ScrollGeometry, top: number): ScrollPos {
  const target = live.pinned ? maxTop(geometry) : top;
  if (live.dragSpace !== null) return { top: target, delta: target - live.scroll };
  return settlePosition(geometry, live.pos.top, { top: target, delta: target - live.scroll });
}

/** Moves the view to content position `top` after a height change; `rendered` is the body height on screen. */
export function placeView<R>(shared: Shared<R>, scroller: HTMLElement, view: { top: number; rendered: number }): void {
  const live = shared.live.current;
  live.scroll = scroller.scrollTop;
  const geometry = geometryOf(live, scroller, view.rendered);
  moveTo(shared, scroller, measuredPosition(live, geometry, view.top));
}

/** Scroll distance in one frame above which a move maps linearly (a jump), not 1 px per px. */
function jumpDistance(geometry: ScrollGeometry, viewport: number): number {
  return Math.max(2 * viewport, geometry.maxScroll / 2000);
}

/** Reads a scroll the browser made (wheel, keys, thumb, script) and renders the position it maps to. */
export function readScroll<R>(shared: Shared<R>, scroller: HTMLElement): void {
  const live = shared.live.current;
  const scrollTop = scroller.scrollTop;
  if (scrollTop === live.scroll) return;
  const geometry = geometryOf(live, scroller, spaceOf(live, live.tree.total));
  const jump = live.dragSpace !== null || Math.abs(scrollTop - live.scroll) > jumpDistance(geometry, scroller.clientHeight);
  live.pinned = atEnd(geometry, scrollTop);
  live.scroll = scrollTop;
  live.pending = null;
  moveTo(shared, scroller, positionAfterScroll({ previous: live.pos, scrollTop, geometry, jump }));
}

/** Scrolls to content position `top` (scaled onto the scroll space when needed) and renders there. */
export function jumpToTop<R>(shared: Shared<R>, top: number): void {
  const scroller = shared.scrollRef.current;
  if (!scroller) return;
  const live = shared.live.current;
  const geometry = geometryOf(live, scroller, spaceOf(live, live.tree.total));
  const pos = positionAt(geometry, top);
  live.pinned = atEnd(geometry, scrollOf(pos));
  live.pending = null;
  moveTo(shared, scroller, pos);
}

/** True for a key event typed into a form control or editable content, whose End key is its own. */
function editing(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return Boolean(target?.isContentEditable) || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '');
}

/** True when End belongs to the scroll container: focus is in it, or nothing is focused and it was the last thing clicked. */
function ownsKeys(scroller: HTMLElement, event: KeyboardEvent, clickedInside: boolean): boolean {
  const target = event.target as Node | null;
  if (target && scroller.contains(target)) return true;
  return clickedInside && (target === document.body || target === document.documentElement);
}

/**
 * End for the scroll container jumps straight to the last row and stays there while the rows
 * near it are measured; the browser's own smooth scroll would stop where the bottom was
 * before they grew.
 */
export function useEndKey<R>(enabled: boolean, shared: Shared<R>): void {
  useEffect(() => {
    const scroller = shared.scrollRef.current;
    if (!enabled || !scroller) return;
    let clickedInside = false;
    const onPointer = (event: Event) => {
      clickedInside = scroller.contains(event.target as Node | null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'End' || event.defaultPrevented || event.altKey || editing(event)) return;
      if (!ownsKeys(scroller, event, clickedInside)) return;
      event.preventDefault();
      jumpToTop(shared, Infinity);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [enabled, shared]);
}

/** Tracks the scroll position: passive listener, at most one update per animation frame, rendered before that frame paints. */
export function useScrollTracking<R>(enabled: boolean, shared: Shared<R>): void {
  useEffect(() => {
    const scroller = shared.scrollRef.current;
    if (!enabled || !scroller) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        flushSync(() => readScroll(shared, scroller));
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [enabled, shared]);
}

/**
 * Holds the container's scroll height for a thumb drag: an empty element ending where the
 * content ends now, so the sub-pixel rounding of the rows' layout cannot lower the height a pixel.
 * Removing it restores the container.
 */
function holdScrollHeight(scroller: HTMLElement): () => void {
  const sizer = document.createElement('div');
  sizer.setAttribute('aria-hidden', 'true');
  Object.assign(sizer.style, { position: 'absolute', left: '0', top: `${scroller.scrollHeight - 1}px`, width: '1px', height: '1px', visibility: 'hidden' });
  const position = scroller.style.position;
  if (getComputedStyle(scroller).position === 'static') scroller.style.position = 'relative';
  scroller.appendChild(sizer);
  return () => {
    sizer.remove();
    scroller.style.position = position;
  };
}

/** Freezes (`space`) or thaws (null) the body height for a thumb drag, and renders it. */
function setDragSpace<R>(shared: Shared<R>, space: number | null): void {
  shared.live.current.dragSpace = space;
  shared.setters.setDragSpace(space);
}

/**
 * Notes a pointer held on the container's own scrollbar (a press on the container itself,
 * right of its content box) and freezes the body height meanwhile; `onRelease` runs when it lets go.
 */
export function useScrollbarDrag<R>(enabled: boolean, shared: Shared<R>, onRelease: () => void): void {
  useEffect(() => {
    const scroller = shared.scrollRef.current;
    if (!enabled || !scroller) return;
    const live = shared.live.current;
    let unhold = () => {};
    const press = (event: MouseEvent) => {
      if (event.target !== scroller || event.offsetX < scroller.clientWidth) return;
      setDragSpace(shared, spaceOf(live, live.tree.total));
      unhold = holdScrollHeight(scroller);
    };
    const release = () => {
      if (live.dragSpace === null) return;
      unhold();
      setDragSpace(shared, null);
      onRelease();
    };
    scroller.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('mouseup', release);
    return () => {
      scroller.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('mouseup', release);
      unhold();
      live.dragSpace = null;
    };
  }, [enabled, shared, onRelease]);
}
