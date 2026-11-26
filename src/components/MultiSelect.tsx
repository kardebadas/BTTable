import { type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Option } from '../core/types';
import { type BTTableLabels, fillLabel } from '../labels';
import { cx } from './classNames';
import { focusNextAfter } from './focusOrder';
import { usePortalPosition } from './popoverPosition';

/** Props of `MultiSelect`. */
export type MultiSelectProps = {
  /** Id of the trigger button, so a `<label htmlFor>` can point at it; the listbox id derives from it. */
  id: string;
  /** Id of the element naming the control; the button is then named by it plus its summary. */
  labelledBy?: string;
  options: readonly Option[];
  /** The chosen option values. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  labels: BTTableLabels;
  /** Where the popover is portalled; default `document.body`. */
  portalContainer?: HTMLElement | null;
};

/** Plain text of an option: a string or number label, else its value. Used by native `<option>`s and the search box. */
export function optionText(option: Option): string {
  const { label } = option;
  return typeof label === 'string' || typeof label === 'number' ? String(label) : option.value;
}

/** Accessible summary of the choice: "All", the one label, or "N selected". */
function summary({ options, value, labels }: MultiSelectProps): ReactNode {
  if (value.length === 0) return labels.filterAll;
  if (value.length > 1) return fillLabel(labels.multiSelected, { count: value.length });
  return options.find((option) => option.value === value[0])?.label ?? value[0];
}

/** Chips shown on the button before the rest collapse into a "+N" chip. */
const MAX_CHIPS = 2;

/** The visible summary: "All", or up to two chips of the chosen labels and a "+N" chip for the rest. */
function Chips({ options, value, labels }: MultiSelectProps) {
  if (value.length === 0) {
    return (
      <span className="btt-multiselect-summary" aria-hidden="true">
        {labels.filterAll}
      </span>
    );
  }
  const rest = value.length - MAX_CHIPS;
  return (
    <span className="btt-multiselect-summary" aria-hidden="true">
      {value.slice(0, MAX_CHIPS).map((item) => (
        <span key={item} className="btt-chip">
          {options.find((option) => option.value === item)?.label ?? item}
        </span>
      ))}
      {rest > 0 && <span className="btt-chip btt-chip--more">+{rest}</span>}
    </span>
  );
}

function toggleValue(value: readonly string[], item: string): string[] {
  return value.includes(item) ? value.filter((other) => other !== item) : [...value, item];
}

type MultiSelectRefs = {
  rootRef: RefObject<HTMLDivElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLUListElement | null>;
};

/** The element refs of one `MultiSelect`, as one stable object. */
function useControlRefs(): MultiSelectRefs {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  return useMemo(() => ({ rootRef, popoverRef, buttonRef, searchRef, listRef }), []);
}

/** Whether `node` is inside the control: its button root or its portalled popover. */
function isInside({ rootRef, popoverRef }: MultiSelectRefs, node: Node | null): boolean {
  if (!node) return false;
  return Boolean(rootRef.current?.contains(node) || popoverRef.current?.contains(node));
}

/** Closes the popover on a mouse press outside the control (the portalled popover counts as inside) while it is open. */
function useOutsideClose(refs: MultiSelectRefs, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onPress = (event: MouseEvent) => {
      if (!isInside(refs, event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPress);
    return () => document.removeEventListener('mousedown', onPress);
  }, [refs, open, close]);
}

/** Open state, search text, active option, focus moves and toggles of one `MultiSelect`. */
function useMultiSelect(props: MultiSelectProps, refs: MultiSelectRefs) {
  const { buttonRef, searchRef, listRef } = refs;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const close = useCallback(
    (returnFocus = false) => {
      setOpen(false);
      setQuery('');
      setActive(0);
      if (returnFocus) buttonRef.current?.focus();
    },
    [buttonRef],
  );
  useOutsideClose(refs, open, close);
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open, searchRef]);
  // aria-activedescendant does not scroll, so keep the active option visible; scrollIntoView is optional (jsdom).
  useEffect(() => {
    const option = listRef.current?.children[active] as HTMLElement | undefined;
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listRef]);
  const needle = query.trim().toLowerCase();
  const visible = props.options.filter((option) => optionText(option).toLowerCase().includes(needle));
  // The visible count drives the list height, so a change re-places the popover.
  usePortalPosition({ open, anchorRef: buttonRef, popoverRef: refs.popoverRef, layoutKey: visible.length });
  const toggle = (item: string) => props.onChange(toggleValue(props.value, item));
  const search = (text: string) => {
    setQuery(text);
    setActive(0);
  };
  const focusSearch = () => searchRef.current?.focus();
  const focusList = () => listRef.current?.focus();
  return { open, setOpen, query, search, active, setActive, visible, toggle, close, focusSearch, focusList };
}

type Controller = ReturnType<typeof useMultiSelect>;

/** Keys of the search box: ArrowDown enters the list, Escape closes. */
function onSearchKey(event: KeyboardEvent, ctl: Controller): void {
  if (event.key === 'Escape') {
    // The popover consumes this Escape: a surrounding dialog must not close as well.
    event.preventDefault();
    event.stopPropagation();
    ctl.close(true);
  } else if (event.key === 'ArrowDown' && ctl.visible.length > 0) {
    event.preventDefault();
    ctl.setActive(0);
    ctl.focusList();
  }
}

/** Keys of the listbox: arrows move (ArrowUp from the top returns to search), Space/Enter toggle, Escape closes. */
function onListKey(event: KeyboardEvent, ctl: Controller): void {
  const { active, visible } = ctl;
  switch (event.key) {
    case 'ArrowDown':
      ctl.setActive(Math.min(active + 1, visible.length - 1));
      break;
    case 'ArrowUp':
      if (active > 0) ctl.setActive(active - 1);
      else ctl.focusSearch();
      break;
    case ' ':
    case 'Enter':
      if (visible[active]) ctl.toggle(visible[active].value);
      break;
    case 'Escape':
      event.stopPropagation();
      ctl.close(true);
      break;
    default:
      return;
  }
  event.preventDefault();
}

/**
 * Tab inside the portalled popover, which sits away from its button in the document, keeps
 * the order of an in-place popover: Shift+Tab from the search box closes it onto the
 * button, Tab from the list closes it and moves on to whatever follows the button.
 */
function onPopoverTab(event: KeyboardEvent, ctl: Controller, refs: MultiSelectRefs): void {
  if (event.key !== 'Tab') return;
  const fromSearch = event.target === refs.searchRef.current;
  if (event.shiftKey !== fromSearch) return;
  event.preventDefault();
  ctl.close(true);
  const button = refs.buttonRef.current;
  if (!event.shiftKey && button) focusNextAfter(button, refs.popoverRef.current);
}

type OptionItemProps = { id: string; option: Option; selected: boolean; active: boolean; onPick: () => void };

/** One listbox option; a press keeps focus where it is, so the list stays open and keyboard-driven. */
function OptionItem({ id, option, selected, active, onPick }: OptionItemProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      className={cx('btt-multiselect-option', active && 'btt-multiselect-option--active')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
    >
      <input type="checkbox" checked={selected} readOnly tabIndex={-1} aria-hidden="true" />
      {option.label}
    </li>
  );
}

type PopoverProps = {
  ctl: Controller;
  refs: MultiSelectRefs;
  listId: string;
  props: MultiSelectProps;
};

/** The listbox of the visible options, driven by `aria-activedescendant` while it has focus. */
function OptionList({ ctl, listId, props, refs }: PopoverProps) {
  const { listRef } = refs;
  const { visible, active } = ctl;
  const optionId = (index: number) => `${listId}-option-${index}`;
  return (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      className="btt-multiselect-list"
      tabIndex={0}
      aria-multiselectable="true"
      aria-labelledby={props.labelledBy}
      aria-activedescendant={visible.length > 0 ? optionId(active) : undefined}
      onKeyDown={(event) => onListKey(event, ctl)}
    >
      {visible.map((option, index) => (
        <OptionItem
          key={option.value}
          id={optionId(index)}
          option={option}
          selected={props.value.includes(option.value)}
          active={index === active}
          onPick={() => {
            ctl.setActive(index);
            ctl.toggle(option.value);
          }}
        />
      ))}
    </ul>
  );
}

/**
 * The popover body: a search box, the option list and the "no options" note. Tab is
 * handled here so the portalled popover keeps an in-place Tab order.
 */
function Popover(popover: PopoverProps) {
  const { ctl, listId, props, refs } = popover;
  const { searchRef, popoverRef } = refs;
  return (
    <div ref={popoverRef} className="btt-multiselect-popover" onKeyDown={(event) => onPopoverTab(event, ctl, refs)}>
      <input
        ref={searchRef}
        type="text"
        className="btt-multiselect-search"
        aria-label={props.labels.searchOptions}
        aria-controls={listId}
        value={ctl.query}
        onChange={(event) => ctl.search(event.target.value)}
        onKeyDown={(event) => onSearchKey(event, ctl)}
      />
      <OptionList {...popover} />
      {ctl.visible.length === 0 && <div className="btt-multiselect-empty">{props.labels.noOptions}</div>}
    </div>
  );
}

/** The popover in its portal: `portalContainer`, else `document.body`. Rendered only while open, so never on the server. */
function PortalPopover(popover: PopoverProps) {
  return createPortal(<Popover {...popover} />, popover.props.portalContainer ?? document.body);
}

/**
 * Package-owned multi-choice dropdown: a button showing the choice as chips (up to two
 * labels, then "+N"; "All" when empty), named by its label plus a hidden summary ("All",
 * the one label, or "N selected"). It opens a popover with a search box and a listbox of
 * checkbox options. Keyboard: ArrowDown on the button opens it and focuses the search box,
 * ArrowDown there enters the list, arrows move, Space or Enter toggles, Escape closes and
 * returns focus to the button. A press outside or focus leaving closes it. Fully
 * controlled by `value`. The popover is portalled (`portalContainer`, default
 * `document.body`) and fixed at the button, so `overflow: hidden` ancestors never clip it;
 * it carries the table's theme and counts as inside for focus and outside presses.
 */
export function MultiSelect(props: MultiSelectProps) {
  const refs = useControlRefs();
  const { rootRef, buttonRef } = refs;
  const ctl = useMultiSelect(props, refs);
  const listId = `${props.id}-listbox`;
  const summaryId = `${props.id}-summary`;
  const onButtonKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' || ctl.open) return;
    event.preventDefault();
    ctl.setOpen(true);
  };
  const onBlur = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next && !isInside(refs, next)) ctl.close();
  };
  return (
    <div ref={rootRef} className="btt-multiselect" onBlur={onBlur}>
      <button
        ref={buttonRef}
        id={props.id}
        type="button"
        className="btt-multiselect-button"
        aria-haspopup="listbox"
        aria-expanded={ctl.open}
        aria-controls={ctl.open ? listId : undefined}
        aria-labelledby={props.labelledBy ? `${props.labelledBy} ${summaryId}` : undefined}
        onClick={() => (ctl.open ? ctl.close() : ctl.setOpen(true))}
        onKeyDown={onButtonKey}
      >
        <span id={summaryId} className="btt-sr-only">
          {summary(props)}
        </span>
        <Chips {...props} />
      </button>
      {ctl.open && <PortalPopover ctl={ctl} refs={refs} listId={listId} props={props} />}
    </div>
  );
}
