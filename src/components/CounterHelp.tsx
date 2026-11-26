import { useEffect, useId, useState } from 'react';
import type { BTTableLabels } from '../labels';

/**
 * A small "?" button next to the counter whose `role="tooltip"` bubble explains
 * `labels.counterHelp`. The bubble is the button's accessible description (always in the
 * DOM, hidden while closed). It shows while the pointer is over the button or bubble, or
 * the button has focus; Escape closes it until the next hover or focus, and that Escape
 * goes no further (a surrounding dialog stays open).
 */
export function CounterHelp({ labels }: { labels: BTTableLabels }) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setDismissed(true);
    };
    // Capture phase on the document: runs before any dialog's own Escape handling.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);
  const enter = (set: (value: boolean) => void) => () => {
    set(true);
    setDismissed(false);
  };
  return (
    <span className="btt-counter-help" onMouseEnter={enter(setHovered)} onMouseLeave={() => setHovered(false)}>
      <button type="button" className="btt-counter-help-button" aria-label={labels.counterHelpButton} aria-describedby={id} onFocus={enter(setFocused)} onBlur={() => setFocused(false)}>
        ?
      </button>
      <span id={id} role="tooltip" className="btt-tooltip" hidden={!open}>
        {labels.counterHelp}
      </span>
    </span>
  );
}
