import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Option } from '../core/types';
import { DEFAULT_LABELS } from '../labels';
import { MultiSelect, optionText } from './MultiSelect';

const OPTIONS: Option[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'hold', label: <b>On hold</b> },
];

function Harness({ initial = [], onChange }: { initial?: string[]; onChange?: (value: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  const change = (next: string[]) => {
    setValue(next);
    onChange?.(next);
  };
  return (
    <div>
      <span id="status-label">Status</span>
      <MultiSelect id="status" labelledBy="status-label" options={OPTIONS} value={value} onChange={change} labels={DEFAULT_LABELS} />
      <button type="button">Elsewhere</button>
    </div>
  );
}

const trigger = () => screen.getByRole('button', { name: /^Status/ });
const options = () => screen.getAllByRole('option');

afterEach(cleanup);

describe('MultiSelect summary', () => {
  it('summarises no choice as All, one as its label, several as a count', () => {
    const { rerender } = render(<MultiSelect id="m" options={OPTIONS} value={[]} onChange={() => {}} labels={DEFAULT_LABELS} />);
    expect(screen.getByRole('button')).toHaveAccessibleName('All');
    rerender(<MultiSelect id="m" options={OPTIONS} value={['hold']} onChange={() => {}} labels={DEFAULT_LABELS} />);
    expect(screen.getByRole('button')).toHaveAccessibleName('On hold');
    rerender(<MultiSelect id="m" options={OPTIONS} value={['open', 'closed']} onChange={() => {}} labels={DEFAULT_LABELS} />);
    expect(screen.getByRole('button')).toHaveAccessibleName('2 selected');
  });

  it('shows up to two chosen labels as chips, then a +N chip, and All when empty', () => {
    const chips = () => Array.from(document.querySelectorAll('.btt-chip')).map((chip) => chip.textContent);
    const { rerender } = render(<MultiSelect id="m" options={OPTIONS} value={[]} onChange={() => {}} labels={DEFAULT_LABELS} />);
    expect(chips()).toEqual([]);
    expect(document.querySelector('.btt-multiselect-summary')).toHaveTextContent('All');
    rerender(<MultiSelect id="m" options={OPTIONS} value={['hold', 'gone']} onChange={() => {}} labels={DEFAULT_LABELS} />);
    expect(chips()).toEqual(['On hold', 'gone']);
    rerender(<MultiSelect id="m" options={OPTIONS} value={['open', 'closed', 'hold']} onChange={() => {}} labels={DEFAULT_LABELS} />);
    expect(chips()).toEqual(['Open', 'Closed', '+1']);
    expect(document.querySelector('.btt-multiselect-summary')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button')).toHaveAccessibleName('3 selected');
  });

  it('is named by its label and its summary and announces a closed listbox popup', () => {
    render(<Harness />);
    expect(trigger()).toHaveAccessibleName('Status All');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('reads option text from string and number labels, else the value', () => {
    expect(optionText({ value: 'a', label: 'Alpha' })).toBe('Alpha');
    expect(optionText({ value: 'a', label: 7 })).toBe('7');
    expect(optionText({ value: 'a', label: <i>x</i> })).toBe('a');
  });
});

describe('MultiSelect with the mouse', () => {
  it('opens a labelled listbox, focuses its search box and toggles options without closing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(trigger());
    const listbox = screen.getByRole('listbox', { name: 'Status' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', listbox.id);
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByRole('textbox', { name: 'Search options' })).toHaveFocus();
    await user.click(screen.getByRole('option', { name: 'Closed' }));
    expect(onChange).toHaveBeenLastCalledWith(['closed']);
    expect(screen.getByRole('option', { name: 'Closed' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'Open' }));
    expect(onChange).toHaveBeenLastCalledWith(['closed', 'open']);
    await user.click(screen.getByRole('option', { name: 'Closed' }));
    expect(onChange).toHaveBeenLastCalledWith(['open']);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('filters the options with its search box and says when none match', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.type(screen.getByRole('textbox'), 'CLO');
    expect(options().map((option) => option.textContent)).toEqual(['Closed']);
    await user.type(screen.getByRole('textbox'), 'x');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No options')).toBeInTheDocument();
  });

  it('closes on an outside click and on a second click of its button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes when focus leaves it and forgets its search text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.type(screen.getByRole('textbox'), 'clo');
    await user.tab();
    expect(screen.getByRole('listbox')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(trigger());
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(options()).toHaveLength(3);
  });
});

describe('MultiSelect with the keyboard', () => {
  it('opens with ArrowDown, moves with the arrows, toggles with Space and Enter, closes with Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('textbox')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveFocus();
    expect(listbox).toHaveAttribute('aria-activedescendant', options()[0].id);
    await user.keyboard('{ArrowDown}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options()[1].id);
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(['closed']);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(listbox).toHaveAttribute('aria-activedescendant', options()[2].id);
    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['closed', 'open']);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAccessibleName('Status 2 selected');
  });

  it('goes back to the search box with ArrowUp on the first option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('closes with Escape from the search box and opens with Enter on the button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('keeps focus in the search box on ArrowDown when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.type(screen.getByRole('textbox'), 'zzz{ArrowDown}');
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('keeps a consumed Escape from reaching document listeners', async () => {
    const user = userEvent.setup();
    const onDocumentKey = vi.fn();
    document.addEventListener('keydown', onDocumentKey);
    render(<Harness />);
    await user.click(trigger());
    await user.keyboard('{Escape}');
    await user.click(trigger());
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', onDocumentKey);
    expect(onDocumentKey.mock.calls.filter(([event]) => event.key === 'Escape')).toHaveLength(1);
  });

  it('scrolls the active option into view', async () => {
    const scrolled: string[] = [];
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrolled.push(this.textContent ?? '');
    });
    Object.assign(HTMLElement.prototype, { scrollIntoView });
    try {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(trigger());
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(scrolled.at(-1)).toBe('On hold');
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('ignores other keys in the list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(trigger());
    await user.keyboard('{ArrowDown}a');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toHaveFocus();
  });
});
