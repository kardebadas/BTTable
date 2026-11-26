import type { RefObject } from 'react';
import { useBrowserLayoutEffect } from '../hooks/useBrowserLayoutEffect';

/** Px between the button and its popover. */
const GAP = 4;

/** Theme custom properties a portalled popover reads, copied from the table root it left. */
const THEME_VARS = [
  '--btt-font',
  '--btt-font-size',
  '--btt-bg',
  '--btt-fg',
  '--btt-surface',
  '--btt-border',
  '--btt-border-strong',
  '--btt-accent',
  '--btt-muted',
  '--btt-radius',
  '--btt-row-hover',
  'color-scheme',
];

/** Classes that force a color scheme; carried over so caller rules keyed on them still match. */
const THEME_CLASSES = ['btt-theme-light', 'btt-theme-dark'];

/**
 * Gives a portalled popover the theme of the table around `anchor`: the computed `--btt-*`
 * values (whichever rule set them: the defaults, `prefers-color-scheme`, a theme class or a
 * caller rule on an ancestor) as inline properties, and the forced-scheme class.
 */
export function copyTheme(anchor: HTMLElement, popover: HTMLElement): void {
  const root = anchor.closest('.btt');
  if (!root) return;
  const computed = getComputedStyle(root);
  // An unset variable comes back '', which setProperty treats as a removal.
  for (const name of THEME_VARS) popover.style.setProperty(name, computed.getPropertyValue(name).trim());
  for (const name of THEME_CLASSES) popover.classList.toggle(name, root.classList.contains(name));
}

/**
 * Places a `position: fixed` popover from the anchor's viewport rect: as wide as the
 * anchor, below it, or above it (anchored by `bottom`) when it does not fit below and
 * there is more room above.
 */
export function placePopover(anchor: HTMLElement, popover: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const viewport = window.innerHeight;
  const roomBelow = viewport - rect.bottom - GAP;
  const above = popover.offsetHeight > roomBelow && rect.top - GAP > roomBelow;
  const { style } = popover;
  style.left = `${rect.left}px`;
  style.width = `${rect.width}px`;
  style.top = above ? '' : `${rect.bottom + GAP}px`;
  style.bottom = above ? `${viewport - rect.top + GAP}px` : '';
  popover.classList.toggle('btt-multiselect-popover--above', above);
}

/** Input of `usePortalPosition`. */
export type PortalPosition = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  /** Changes whenever the popover's height may change (e.g. the visible option count); a change re-places it. */
  layoutKey: unknown;
};

/** Media query whose change re-themes an open popover (the table's dark variables follow it). */
const COLOR_SCHEME = '(prefers-color-scheme: dark)';

/**
 * While `open`, keeps the portalled popover themed like its table and placed at its
 * anchor: before paint, when `layoutKey` changes, on any scroll (capture: any scrolling
 * ancestor), on resize and when the color scheme changes. Listeners are passive and
 * removed on close. Runs in the browser only.
 */
export function usePortalPosition({ open, anchorRef, popoverRef, layoutKey }: PortalPosition): void {
  useBrowserLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!open || !anchor || !popover) return;
    const place = () => {
      copyTheme(anchor, popover);
      placePopover(anchor, popover);
    };
    place();
    const scheme = window.matchMedia?.(COLOR_SCHEME);
    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place, { passive: true });
    scheme?.addEventListener?.('change', place);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
      scheme?.removeEventListener?.('change', place);
    };
  }, [open, anchorRef, popoverRef, layoutKey]);
}
