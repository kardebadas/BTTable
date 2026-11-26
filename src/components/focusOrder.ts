/** Elements that can take Tab focus, before `tabIndex` and `disabled` are checked. */
const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';

/**
 * Whether Tab can land on `element`: a non-negative `tabIndex`, not disabled, not inside an
 * `inert` or `hidden` subtree, and rendered (`checkVisibility`, where the browser has it).
 */
function isTabbable(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || (element as HTMLButtonElement).disabled) return false;
  if (element.closest('[inert], [hidden]')) return false;
  return element.checkVisibility?.() !== false;
}

/**
 * Focuses the first tabbable element after `anchor` in document order, outside `skip`
 * (the portalled popover being left); keeps focus where it is when there is none.
 */
export function focusNextAfter(anchor: HTMLElement, skip: HTMLElement | null): void {
  // ponytail: document order only; positive tabindex is not ranked, add if a caller needs it.
  const all = Array.from(anchor.ownerDocument.querySelectorAll<HTMLElement>(FOCUSABLE));
  const after = all.slice(all.indexOf(anchor) + 1);
  after.find((element) => isTabbable(element) && !skip?.contains(element))?.focus();
}
