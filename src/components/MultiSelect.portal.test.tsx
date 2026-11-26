import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Option } from '../core/types';
import { DEFAULT_LABELS } from '../labels';
import { MultiSelect } from './MultiSelect';

const OPTIONS: Option[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'hold', label: <b>On hold</b> },
];

/** A MultiSelect outside any table. */
function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <div>
      <span id="status-label">Status</span>
      <MultiSelect id="status" labelledBy="status-label" options={OPTIONS} value={value} onChange={setValue} labels={DEFAULT_LABELS} />
    </div>
  );
}

const trigger = () => screen.getByRole('button', { name: /^Status/ });

afterEach(cleanup);

describe('MultiSelect popover portal', () => {
  const rect = (top: number, left = 20, width = 200, height = 30) =>
    ({ top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  const popover = () => document.querySelector('.btt-multiselect-popover') as HTMLElement;

  function Themed({ container }: { container?: HTMLElement | null }) {
    const [value, setValue] = useState<string[]>([]);
    return (
      <div className="btt btt-theme-dark" style={{ ['--btt-bg' as string]: 'rgb(1, 2, 3)' }}>
        <div className="clip" style={{ overflow: 'hidden' }}>
          <span id="status-label">Status</span>
          <MultiSelect id="status" labelledBy="status-label" options={OPTIONS} value={value} onChange={setValue} labels={DEFAULT_LABELS} portalContainer={container} />
        </div>
        <button type="button">Elsewhere</button>
      </div>
    );
  }

  afterEach(() => vi.restoreAllMocks());

  it('renders the popover in document.body, outside the clipping ancestors', async () => {
    const user = userEvent.setup();
    render(<Themed />);
    await user.click(trigger());
    expect(popover().parentElement).toBe(document.body);
    expect(document.querySelector('.clip')?.contains(popover())).toBe(false);
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('renders the popover in portalContainer when given', async () => {
    const user = userEvent.setup();
    const container = document.createElement('section');
    document.body.append(container);
    render(<Themed container={container} />);
    await user.click(trigger());
    expect(popover().parentElement).toBe(container);
    container.remove();
  });

  it('carries the table theme class and its computed variables', async () => {
    const user = userEvent.setup();
    render(<Themed />);
    await user.click(trigger());
    expect(popover()).toHaveClass('btt-theme-dark');
    expect(popover()).not.toHaveClass('btt-theme-light');
    expect(popover().style.getPropertyValue('--btt-bg')).toBe('rgb(1, 2, 3)');
  });

  it('takes no theme outside a table', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    expect(popover().getAttribute('style')).not.toContain('--btt-bg');
  });

  it('sits fixed below the button, as wide as it', async () => {
    const user = userEvent.setup();
    render(<Themed />);
    vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(rect(100));
    await user.click(trigger());
    expect(popover().style).toMatchObject({ top: '134px', left: '20px', width: '200px', bottom: '' });
    expect(popover()).not.toHaveClass('btt-multiselect-popover--above');
  });

  it('flips above the button when there is no room below and more above', async () => {
    const user = userEvent.setup();
    render(<Themed />);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
    vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(rect(window.innerHeight - 100));
    await user.click(trigger());
    expect(popover().style).toMatchObject({ top: '', bottom: '104px' });
    expect(popover()).toHaveClass('btt-multiselect-popover--above');
  });

  it('follows the button when any ancestor scrolls or the window resizes, and stops after closing', async () => {
    const user = userEvent.setup();
    render(<Themed />);
    const box = vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(rect(100));
    await user.click(trigger());
    box.mockReturnValue(rect(50, 40));
    fireEvent.scroll(document.querySelector('.clip') as Element);
    expect(popover().style).toMatchObject({ top: '84px', left: '40px' });
    box.mockReturnValue(rect(10, 5, 120));
    fireEvent(window, new Event('resize'));
    expect(popover().style).toMatchObject({ top: '44px', left: '5px', width: '120px' });
    const remove = vi.spyOn(window, 'removeEventListener');
    await user.keyboard('{Escape}');
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true });
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('re-copies the theme when it changes while open, on scroll and on a color-scheme change', async () => {
    const listeners: (() => void)[] = [];
    const media = { matches: false, addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const user = userEvent.setup();
    render(<Themed />);
    await user.click(trigger());
    const root = document.querySelector('.btt') as HTMLElement;
    root.style.setProperty('--btt-bg', 'rgb(9, 9, 9)');
    fireEvent.scroll(window);
    expect(popover().style.getPropertyValue('--btt-bg')).toBe('rgb(9, 9, 9)');
    root.style.setProperty('--btt-bg', 'rgb(7, 7, 7)');
    root.classList.replace('btt-theme-dark', 'btt-theme-light');
    expect(listeners).toHaveLength(1);
    act(() => listeners[0]());
    expect(popover().style.getPropertyValue('--btt-bg')).toBe('rgb(7, 7, 7)');
    expect(popover()).toHaveClass('btt-theme-light');
    await user.keyboard('{Escape}');
    expect(media.removeEventListener).toHaveBeenCalledWith('change', listeners[0]);
    vi.unstubAllGlobals();
  });

  it('re-places the popover when the search changes its height', async () => {
    const user = userEvent.setup();
    render(<Themed />);
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
    vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(rect(window.innerHeight - 100));
    await user.click(trigger());
    expect(popover()).toHaveClass('btt-multiselect-popover--above');
    height.mockReturnValue(40);
    await user.type(screen.getByRole('textbox'), 'clo');
    expect(popover()).not.toHaveClass('btt-multiselect-popover--above');
    expect(popover().style.top).toBe(`${window.innerHeight - 66}px`);
  });

  it('skips hidden, inert and invisible elements when Tab leaves the list', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MultiSelect id="m" options={OPTIONS} value={[]} onChange={() => {}} labels={DEFAULT_LABELS} />
        <button type="button" hidden>
          Hidden
        </button>
        <div inert>
          <button type="button">Inert</button>
        </div>
        <button type="button" className="gone">
          Gone
        </button>
        <button type="button">Next</button>
      </div>,
    );
    const gone = document.querySelector('.gone') as HTMLElement & { checkVisibility?: () => boolean };
    gone.checkVisibility = () => false;
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });

  it('treats a press inside the portalled popover as inside and one elsewhere as outside', async () => {
    render(<Themed />);
    await userEvent.setup().click(trigger());
    fireEvent.mouseDown(popover());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps Tab order: Shift+Tab from the search box returns to the button, Tab from the list moves past it', async () => {
    const user = userEvent.setup();
    render(<Themed />);
    await user.click(trigger());
    await user.tab({ shift: true });
    expect(trigger()).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.keyboard('{ArrowDown}');
    await user.tab();
    expect(screen.getByRole('listbox')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('textbox')).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps focus on the button when nothing tabbable follows it', async () => {
    const user = userEvent.setup();
    render(<MultiSelect id="solo" options={OPTIONS} value={[]} onChange={() => {}} labels={DEFAULT_LABELS} />);
    await user.click(screen.getByRole('button'));
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
