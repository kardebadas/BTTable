import { describe, expect, it } from 'vitest';
import { MAX_SCROLL_SPACE, maxTop, positionAfterScroll, positionAt, type ScrollGeometry, scrollOf, scrollSpace, settlePosition } from './scrollMap';

// 60M px of rows in the 15M px space, viewport 600 px.
const scaled: ScrollGeometry = { total: 60_000_000, space: MAX_SCROLL_SPACE, maxScroll: MAX_SCROLL_SPACE - 600 };
const plain: ScrollGeometry = { total: 400_000, space: 400_000, maxScroll: 399_400 };
const page = MAX_SCROLL_SPACE / 100;

describe('scrollSpace', () => {
  it('caps the body height under every browser limit', () => {
    expect(scrollSpace(1000)).toBe(1000);
    expect(scrollSpace(60_000_000)).toBe(MAX_SCROLL_SPACE);
    expect(MAX_SCROLL_SPACE).toBeLessThan(17_895_430);
  });
});

describe('below the cap', () => {
  it('maps every scroll position to itself', () => {
    const previous = { top: 100, delta: 0 };
    expect(positionAfterScroll({ previous, scrollTop: 5000, geometry: plain, jump: true })).toEqual({ top: 5000, delta: 0 });
    expect(positionAfterScroll({ previous, scrollTop: 150, geometry: plain, jump: false })).toEqual({ top: 150, delta: 0 });
    expect(settlePosition(plain, 0, { top: 2080, delta: 30 })).toEqual({ top: 2080, delta: 0 });
    expect(positionAt(plain, 20_000)).toEqual({ top: 20_000, delta: 0 });
  });

  it('clamps a jump past the end to the last position', () => {
    expect(positionAt(plain, 1e9)).toEqual({ top: 399_400, delta: 0 });
  });
});

describe('above the cap', () => {
  it('maps the ends to the ends', () => {
    const previous = { top: 30_000_000, delta: 15_000_000 };
    expect(positionAfterScroll({ previous, scrollTop: 0, geometry: scaled, jump: false })).toEqual({ top: 0, delta: 0 });
    const end = positionAfterScroll({ previous, scrollTop: scaled.maxScroll, geometry: scaled, jump: false });
    expect(end.top).toBe(maxTop(scaled));
    expect(maxTop(scaled)).toBe(60_000_000 - 600);
    expect(scrollOf(end)).toBe(scaled.maxScroll);
  });

  it('maps a jump linearly: half the scroll range is half the content', () => {
    const pos = positionAfterScroll({ previous: { top: 0, delta: 0 }, scrollTop: scaled.maxScroll / 2, geometry: scaled, jump: true });
    expect(pos.top).toBeCloseTo(maxTop(scaled) / 2, 3);
    expect(scrollOf(pos)).toBeCloseTo(scaled.maxScroll / 2, 3);
  });

  it('moves the content 1 px per px on a small scroll within a page', () => {
    const start = positionAt(scaled, 3.5 * page * 4);
    const next = positionAfterScroll({ previous: start, scrollTop: scrollOf(start) + 120, geometry: scaled, jump: false });
    expect(next.top).toBeCloseTo(start.top + 120, 6);
    expect(next.delta).toBe(start.delta);
  });

  it('moves the scroll position, not the content, when a small scroll crosses into another page', () => {
    const before = { top: 10 * page - 50, delta: 1_000_000 };
    const next = positionAfterScroll({ previous: before, scrollTop: scrollOf(before) + 100, geometry: scaled, jump: false });
    expect(next.top).toBeCloseTo(before.top + 100, 6);
    expect(next.delta).not.toBe(before.delta);
  });

  it('keeps the last page exact so the end stays reachable after the rows grow', () => {
    const grown = { ...scaled, total: 61_000_000 };
    const pos = settlePosition(grown, maxTop(scaled), { top: maxTop(grown), delta: 0 });
    expect(pos.delta).toBe(grown.total - grown.space);
    expect(scrollOf(pos)).toBe(grown.maxScroll);
  });

  it('keeps the scroll position inside the range', () => {
    const pos = settlePosition(scaled, 0, { top: 100, delta: 5000 });
    expect(scrollOf(pos)).toBe(0);
    expect(pos.top).toBe(100);
  });

  it('puts a jump target on the linear map', () => {
    const pos = positionAt(scaled, maxTop(scaled) / 4);
    expect(scrollOf(pos)).toBeCloseTo(scaled.maxScroll / 4, 3);
    expect(positionAt(scaled, -10)).toEqual({ top: 0, delta: 0 });
  });
});
