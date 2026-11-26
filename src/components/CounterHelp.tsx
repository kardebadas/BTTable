import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import type { BTTableLabels } from '../labels';

/** True when an Escape is aimed at the help: at its button, or at nothing focused. */
function aimedAtHelp(event: KeyboardEvent, button: HTMLElement | null): boolean {
  const { target } = event;
  return target === button || target === document || target === document.body || target === document.documentElement;
}

/**
 * While `open`, Escape calls `setDismissed(true)`; an Escape aimed at the help is also stopped. Capture
 * phase on the document: runs before any dialog's own Escape handling.
 */
function useEscapeToDismiss(open: boolean, buttonRef: RefObject<HTMLElement | null>, setDismissed: (value: boolean) => void): void {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (aimedAtHelp(event, buttonRef.current)) event.stopPropagation();
      setDismissed(true);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, buttonRef, setDismissed]);
}

/**
 * A small "?" button next to the counter whose `role="tooltip"` bubble explains
 * `labels.counterHelp`. The bubble is the button's accessible description (always in the
 * DOM, hidden while closed). It shows while the pointer is over the button or bubble, or
 * the button has focus; Escape closes it until the next hover or focus. An Escape aimed at
 * the help (its button has focus, or nothing has) goes no further, so a surrounding dialog
 * stays open; one aimed at another focused element (a filter, a dialog) still reaches it.
 */
export function CounterHelp({ labels }: { labels: BTTableLabels }) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;
  useEscapeToDismiss(open, buttonRef, setDismissed);
  const enter = (set: (value: boolean) => void) => () => {
    set(true);
    setDismissed(false);
  };
  return (
    <span className="btt-counter-help" onMouseEnter={enter(setHovered)} onMouseLeave={() => setHovered(false)}>
      <button ref={buttonRef} type="button" className="btt-counter-help-button" aria-label={labels.counterHelpButton} aria-describedby={id} onFocus={enter(setFocused)} onBlur={() => setFocused(false)}>
        ?
      </button>
      <span id={id} role="tooltip" className="btt-tooltip" hidden={!open}>
        {labels.counterHelp}
      </span>
    </span>
  );
}
