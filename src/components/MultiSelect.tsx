import { type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Option } from '../core/types';
import { type BTTableLabels, fillLabel } from '../labels';
import { cx } from './classNames';

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

/** Closes the popover on a mouse press outside `root` while it is open. */
function useOutsideClose(root: RefObject<HTMLDivElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onPress = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPress);
    return () => document.removeEventListener('mousedown', onPress);
  }, [root, open, close]);
}

type MultiSelectRefs = {
  rootRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLUListElement | null>;
};

/** Open state, search text, active option, focus moves and toggles of one `MultiSelect`. */
function useMultiSelect(props: MultiSelectProps, { rootRef, buttonRef, searchRef, listRef }: MultiSelectRefs) {
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
  useOutsideClose(rootRef, open, close);
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
  listId: string;
  props: MultiSelectProps;
  searchRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLUListElement | null>;
};

/** The listbox of the visible options, driven by `aria-activedescendant` while it has focus. */
function OptionList({ ctl, listId, props, listRef }: Omit<PopoverProps, 'searchRef'>) {
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

function Popover(popover: PopoverProps) {
  const { ctl, listId, props, searchRef } = popover;
  return (
    <div className="btt-multiselect-popover">
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

/**
 * Package-owned multi-choice dropdown: a button showing the choice as chips (up to two
 * labels, then "+N"; "All" when empty), named by its label plus a hidden summary ("All",
 * the one label, or "N selected"). It opens a popover with a search box and a listbox of
 * checkbox options. Keyboard: ArrowDown on the button opens it and focuses the search box,
 * ArrowDown there enters the list, arrows move, Space or Enter toggles, Escape closes and
 * returns focus to the button. A press outside or focus leaving closes it. Fully
 * controlled by `value`.
 */
export function MultiSelect(props: MultiSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const ctl = useMultiSelect(props, { rootRef, buttonRef, searchRef, listRef });
  const listId = `${props.id}-listbox`;
  const summaryId = `${props.id}-summary`;
  const onButtonKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' || ctl.open) return;
    event.preventDefault();
    ctl.setOpen(true);
  };
  const onBlur = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next && !event.currentTarget.contains(next)) ctl.close();
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
      {ctl.open && <Popover ctl={ctl} listId={listId} props={props} searchRef={searchRef} listRef={listRef} />}
    </div>
  );
}
